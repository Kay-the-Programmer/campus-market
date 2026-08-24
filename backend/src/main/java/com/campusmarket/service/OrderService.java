package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.*;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.util.Money;
import com.campusmarket.web.dto.CommerceDtos.*;
import com.campusmarket.web.dto.UserDtos;
import com.campusmarket.web.error.ApiException;
import com.campusmarket.web.request.CommerceRequests.CheckoutRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Buyer-placed orders and the seller's response to them.
 *
 * <p>Checkout splits the cart by seller and writes one {@link Order} each,
 * because every seller decides independently whether they still have the item.
 * From there the order is seller-driven: accept, decline, or complete. Only
 * completion writes a {@link Deal}, which stays the immutable record of a
 * handover that actually happened.
 */
@Service
@RequiredArgsConstructor
public class OrderService {

    /** Unambiguous alphabet - no O/0 or I/1, since people read these aloud. */
    private static final String REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int REFERENCE_LENGTH = 6;

    private final OrderRepository orderRepository;
    private final CartItemRepository cartItemRepository;
    private final DealRepository dealRepository;
    private final ConversationService conversationService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    private final SecureRandom random = new SecureRandom();

    // ---------------------------------------------------------------- checkout
    /**
     * Turns the cart into one pending order per seller.
     *
     * <p>Availability and stock are re-checked here rather than trusted from
     * when the item was added - things sell, and sellers cut their serving
     * counts, while a cart sits open. Anything gone is dropped from the cart
     * and reported back by name so the buyer knows what changed; anything that
     * no longer has the quantity ordered stops the checkout, since that is a
     * number the buyer chose and must get the chance to change themselves.
     */
    @Transactional
    public CheckoutOrdersDto checkout(Principal principal, CheckoutRequest request) {
        accessGuard.requireVerifiedCustomer(principal);

        List<CartItem> items = cartItemRepository.findByUserIdOrderByAddedAtDesc(principal.id());
        if (items.isEmpty()) {
            throw ApiException.badRequest("EMPTY_CART", "Your cart is empty.");
        }

        List<String> skipped = new ArrayList<>();
        List<CartItem> purchasable = new ArrayList<>();

        for (CartItem item : items) {
            Listing listing = item.getListing();
            if (!mapper.isPurchasable(listing)) {
                skipped.add(listing.isDeleted() ? "A removed listing" : listing.getTitle());
                cartItemRepository.delete(item);
            } else if (listing.getSeller().getId().equals(principal.id())) {
                // Defensive: the cart refuses own listings on add, but a listing
                // can in principle change hands between add and checkout.
                skipped.add(listing.getTitle());
                cartItemRepository.delete(item);
            } else {
                /*
                 * Stock is re-checked here for the same reason availability is:
                 * a food seller can cut their serving count while the cart sits
                 * there. CartService caps every add and every quantity change
                 * against this number, so an order that exceeds it breaks an
                 * invariant the cart otherwise holds - and does it silently,
                 * leaving the buyer to turn up for four portions of something
                 * the seller now has two of.
                 *
                 * Reported rather than quietly reduced: the quantity is what
                 * the buyer agreed to, and shrinking it on their behalf at the
                 * moment of purchase is not ours to do.
                 */
                Integer stock = Listings.availableStock(listing);
                if (stock != null && item.getQuantity() > stock) {
                    throw ApiException.conflict("INSUFFICIENT_STOCK",
                            "\"" + listing.getTitle() + "\" only has " + stock
                                    + " left. Adjust the quantity and try again.");
                }
                purchasable.add(item);
            }
        }

        if (purchasable.isEmpty()) {
            throw ApiException.conflict("ALL_ITEMS_UNAVAILABLE",
                    "Every item in your cart is no longer available.");
        }

        CampusZone meetupZone = parseZone(request == null ? null : request.meetupZone());
        if (meetupZone == null) {
            meetupZone = principal.user().getCampusZone();
        }
        String note = blankToNull(request == null ? null : request.note());

        Map<UUID, List<CartItem>> bySeller = purchasable.stream()
                .collect(Collectors.groupingBy(item -> item.getListing().getSeller().getId(),
                        LinkedHashMap::new, Collectors.toList()));

        List<OrderDto> placed = new ArrayList<>();

        for (List<CartItem> sellerItems : bySeller.values()) {
            User seller = sellerItems.get(0).getListing().getSeller();

            // An unverified seller never sees the order directly - it waits for
            // an admin, who either releases it or supplies the goods themselves.
            boolean held = seller.ordersNeedReview();

            Order order = new Order();
            order.setReference(nextReference());
            order.setBuyer(principal.user());
            order.setSeller(seller);
            order.setStatus(held ? OrderStatus.HELD : OrderStatus.PENDING);
            order.setMeetupZone(meetupZone);
            order.setBuyerNote(note);

            for (CartItem cartItem : sellerItems) {
                Listing listing = cartItem.getListing();
                OrderItem line = new OrderItem();
                line.setListing(listing);
                line.setTitleSnapshot(listing.getTitle());
                line.setImageSnapshot(listing.getImages().isEmpty()
                        ? null : listing.getImages().get(0).getUrl());
                line.setUnitPrice(listing.getPrice());
                line.setQuantity(cartItem.getQuantity());
                order.addItem(line);
            }
            order.recalculateTotal();
            orderRepository.save(order);

            if (held) {
                // No chat thread and no seller notification: both would tell an
                // unvetted seller about an order they are not yet allowed to see.
                //
                // The buyer is told their order is in hand, and deliberately not
                // told why. The reason is a judgement about the seller's standing
                // - unproven, not disproven - and broadcasting it to a stranger
                // convicts them of something no admin has actually found. It also
                // invites the buyer to go around us and contact them directly,
                // which is the exact exposure holding the order prevents.
                notificationService.notify(principal.user(), NotificationType.ORDER,
                        "Order " + order.getReference() + " is being processed",
                        "We're getting this ready and will update you shortly.",
                        orderLink(order));
            } else {
                // The chat thread is still where pickup gets arranged; the order
                // gives it a reference so both sides discuss the same thing.
                Conversation conversation =
                        conversationService.findOrCreate(sellerItems.get(0).getListing(), principal.user());
                conversationService.postMessage(conversation, principal.user(),
                        buildOrderMessage(order, note));

                notificationService.notify(seller, NotificationType.ORDER,
                        "New order from " + principal.user().getName(),
                        describeOrder(order),
                        orderLink(order));
            }

            sellerItems.forEach(cartItemRepository::delete);
            placed.add(toDto(order, principal, principal.id()));
        }

        return new CheckoutOrdersDto(placed, skipped, placed.size());
    }

    // ------------------------------------------------------------------ reads
    /**
     * Orders where the viewer is the seller - the "incoming orders" inbox.
     *
     * <p>Held orders are filtered out at the repository level, not hidden in the
     * UI: an unverified seller must not learn that an order exists until an
     * admin has released it.
     */
    @Transactional(readOnly = true)
    public List<OrderDto> incoming(Principal principal) {
        accessGuard.requireOwnerContext(principal);
        return orderRepository.findForSellerVisible(principal.id()).stream()
                .map(order -> toDto(order, principal, principal.id()))
                .toList();
    }

    /** Orders the viewer placed. */
    @Transactional(readOnly = true)
    public List<OrderDto> placed(Principal principal) {
        accessGuard.requireCustomer(principal);
        return orderRepository.findForBuyer(principal.id()).stream()
                .map(order -> toDto(order, principal, principal.id()))
                .toList();
    }

    /**
     * One order, for its own page.
     *
     * <p>Needed because a notification points at a specific order and the
     * screen it opens cannot assume that order is in whichever list happens to
     * be loaded - it may be on the other tab, or long since completed.
     *
     * <p>A held order is readable by its buyer here, unlike in the seller's
     * inbox: it is the buyer's own order, they were told it exists, and they
     * may still cancel it. The seller is the one who must not see it, which is
     * what the participant check below enforces.
     */
    @Transactional(readOnly = true)
    public OrderDto byId(Principal principal, UUID orderId) {
        accessGuard.requireOwnerContext(principal);
        Order order = orderRepository.findByIdWithItems(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));

        boolean isBuyer = order.getBuyer().getId().equals(principal.id());
        boolean isSeller = order.getSeller().getId().equals(principal.id());

        // An unverified seller must not learn a held order exists, which is the
        // same rule findForSellerVisible applies to the inbox.
        if (isSeller && order.getStatus() == OrderStatus.HELD) {
            throw ApiException.notFound("Order not found.");
        }
        if (!isBuyer && !isSeller && !principal.isAdmin()) {
            throw ApiException.forbidden("You can only view your own orders.");
        }
        return toDto(order, principal, principal.id());
    }

    @Transactional(readOnly = true)
    public long openIncomingCount(UUID sellerId) {
        return orderRepository.countBySellerIdAndStatusIn(
                sellerId, List.of(OrderStatus.PENDING, OrderStatus.ACCEPTED));
    }

    // ------------------------------------------------------------ transitions
    @Transactional
    public OrderDto accept(Principal principal, UUID orderId) {
        Order order = loadForSeller(principal, orderId);
        requireStatus(order, OrderStatus.PENDING, "Only a pending order can be accepted.");

        order.setStatus(OrderStatus.ACCEPTED);
        order.setRespondedAt(Instant.now());

        notificationService.notify(order.getBuyer(), NotificationType.ORDER,
                order.getSeller().getName() + " accepted your order",
                "Order " + order.getReference() + " · arrange pickup in chat.",
                orderLink(order));

        return toDto(order, principal, principal.id());
    }

    @Transactional
    public OrderDto decline(Principal principal, UUID orderId, String note) {
        Order order = loadForSeller(principal, orderId);
        requireStatus(order, OrderStatus.PENDING, "Only a pending order can be declined.");

        order.setStatus(OrderStatus.DECLINED);
        order.setRespondedAt(Instant.now());
        order.setSellerNote(blankToNull(note));

        notificationService.notify(order.getBuyer(), NotificationType.ORDER,
                order.getSeller().getName() + " declined your order",
                order.getSellerNote() != null
                        ? order.getSellerNote()
                        : "Order " + order.getReference() + " was declined.",
                orderLink(order));

        return toDto(order, principal, principal.id());
    }

    /**
     * Marks the handover done and writes the {@link Deal} that deal history and
     * reviews are built from. This is the only path that creates a Deal from an
     * order, so an order can never be counted twice.
     */
    @Transactional
    public OrderDto complete(Principal principal, UUID orderId) {
        Order order = loadForSeller(principal, orderId);
        requireStatus(order, OrderStatus.ACCEPTED,
                "Accept the order before marking it complete.");

        settle(order);

        notificationService.notify(order.getBuyer(), NotificationType.ORDER,
                "Order " + order.getReference() + " completed",
                "Leave " + order.getSeller().getName() + " a review.",
                "/deals");

        return toDto(order, principal, principal.id());
    }

    /**
     * Closes an order out: marks it complete and writes one {@link Deal} per
     * ordered listing, which is what deal history, reviews and seller stats are
     * built from.
     *
     * <p>Shared by the seller's own "complete" and the admin's "fulfil", so an
     * admin-brokered handover produces exactly the same records as a direct one.
     * The Deal is always buyer-to-seller even when an admin handled the goods -
     * the sale was still the seller's, and crediting it to the admin would
     * corrupt both parties' history and leave the buyer reviewing the wrong
     * person. Who physically handled it is recorded on the order instead.
     */
    private void settle(Order order) {
        order.setStatus(OrderStatus.COMPLETED);
        order.setCompletedAt(Instant.now());

        for (OrderItem line : order.getItems()) {
            Listing listing = line.getListing();
            if (listing == null) {
                continue;
            }
            Deal deal = new Deal();
            deal.setListing(listing);
            deal.setBuyer(order.getBuyer());
            deal.setSeller(order.getSeller());
            deal.setPrice(line.lineTotal());
            deal.setMeetupLocation(order.getMeetupZone() == null
                    ? listing.getLocation() : order.getMeetupZone().label());
            deal.setStatus(DealStatus.COMPLETED);
            dealRepository.save(deal);

            /*
             * The listing is deliberately left alone.
             *
             * Completing an order used to retire the product automatically, on
             * the assumption that one order empties it. Nothing records how
             * many a seller has, so that assumption was guesswork - and when it
             * guessed wrong it closed a listing that still had stock, silently,
             * with no way for the seller to see why it had stopped selling.
             *
             * Marking sold is now the seller's own act, from their listing or
             * from the chat thread. It is the only signal that reliably means
             * the thing is gone, because it comes from the person holding it.
             */
        }
    }

    // ------------------------------------------------- admin middleman (held)
    /** The review queue: orders withheld from unverified sellers. */
    @Transactional(readOnly = true)
    public List<OrderDto> heldForReview(Principal principal) {
        accessGuard.requireAdmin(principal);
        return orderRepository.findHeld().stream()
                .map(order -> toDto(order, principal, null))
                .toList();
    }

    @Transactional(readOnly = true)
    public long heldCount() {
        return orderRepository.countByStatus(OrderStatus.HELD);
    }

    /**
     * Hands a withheld order on to its seller: it becomes an ordinary PENDING
     * order and the seller takes it from here.
     */
    @Transactional
    public OrderDto release(Principal principal, UUID orderId, String note) {
        Order order = loadHeld(principal, orderId);

        order.setStatus(OrderStatus.PENDING);
        order.setReviewedAt(Instant.now());
        order.setAdminNote(blankToNull(note));

        // The chat thread was deliberately not opened at checkout, so it is
        // opened now - this is the first moment the seller may know about it.
        Listing listing = order.getItems().stream()
                .map(OrderItem::getListing)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (listing != null) {
            Conversation conversation = conversationService.findOrCreate(listing, order.getBuyer());
            conversationService.postMessage(conversation, order.getBuyer(),
                    buildOrderMessage(order, order.getBuyerNote()));
        }

        auditService.record(principal.user(), AuditAction.RELEASE_ORDER,
                "order", order.getId(), order.getAdminNote(),
                "Released order " + order.getReference() + " to "
                        + order.getSeller().getName() + ".");

        notificationService.notify(order.getSeller(), NotificationType.ORDER,
                "New order from " + order.getBuyer().getName(),
                describeOrder(order),
                orderLink(order));
        notificationService.notify(order.getBuyer(), NotificationType.ORDER,
                "Order " + order.getReference() + " approved",
                "Your order has been passed to " + order.getSeller().getName() + ".",
                orderLink(order));

        return toDto(order, principal, null);
    }

    /**
     * The admin supplies the goods themselves rather than routing the order on
     * to an unverified seller, and the order completes here.
     *
     * <p>Fulfilling opens the buyer-seller thread with the admin added as its
     * mediator, rather than leaving the two parties with no shared record. The
     * admin is a real participant: they are holding the goods, so the buyer has
     * to be able to reach them to collect.
     *
     * <p>The order's details go into that thread <em>withheld from the
     * seller</em>. Their sale, their stats, their review - but they are
     * unverified, which is the whole reason the order was held, so they are not
     * yet entitled to the buyer's name, note or meeting point. Verification
     * lifts it and hands them a thread that is already complete.
     */
    @Transactional
    public FulfilledOrderDto fulfil(Principal principal, UUID orderId, String note) {
        Order order = loadHeld(principal, orderId);

        order.setReviewedAt(Instant.now());
        order.setAdminNote(blankToNull(note));
        order.setFulfilledByAdmin(principal.user());
        settle(order);

        // Handed back to the caller: the admin has just taken personal
        // responsibility for a handover, and arranging it is the next thing
        // they do. Telling them a thread exists somewhere in Messages made
        // them go and find it.
        Conversation thread = openMediatedThread(order, principal.user());

        auditService.record(principal.user(), AuditAction.FULFIL_ORDER,
                "order", order.getId(), order.getAdminNote(),
                "Fulfilled order " + order.getReference() + " directly instead of "
                        + "routing it to unverified seller " + order.getSeller().getName() + ".");

        notificationService.notify(order.getBuyer(), NotificationType.ORDER,
                "Order " + order.getReference() + " is ready",
                "Our team has handled this one. " + describeOrder(order)
                        + " Open the chat to arrange collection.",
                orderLink(order));

        /*
         * The seller is told a sale happened and nothing else - no reference,
         * no buyer, no items, no quantities, no meeting point. Naming the item
         * alone would identify the buyer on a catalogue this small, where most
         * listings are one-of-one and the seller knows who was asking.
         *
         * What they are given instead is the way out: get verified, and the
         * order - and the thread it opened - become theirs to see.
         */
        notificationService.notify(order.getSeller(), NotificationType.ORDER,
                "One of your items sold",
                "Our team handled this sale for you. Verify your account to see "
                        + "the details and deal with buyers yourself.",
                "/profile");

        return new FulfilledOrderDto(
                toDto(order, principal, null),
                thread == null ? null : thread.getId());
    }

    /**
     * Opens (or reuses) the thread for a fulfilled order and marks the admin as
     * its mediator.
     *
     * <p>Two messages land: the order itself, sealed from the seller, and a
     * plain-language line for the buyer explaining who they are now dealing
     * with. The buyer's copy is deliberately not withheld - it names no items
     * and no prices, so there is nothing in it the seller may not see, and a
     * thread that looked empty to the seller after verification would be worse
     * than one that shows the handover happened.
     */
    private Conversation openMediatedThread(Order order, User admin) {
        Listing listing = order.getItems().stream()
                .map(OrderItem::getListing)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (listing == null) {
            // Every line's listing was hard-deleted. There is nothing to pin a
            // conversation to, and inventing one would point at a dead record.
            return null;
        }

        Conversation conversation = conversationService.findOrCreate(listing, order.getBuyer());
        conversation.setMediatorAdmin(admin);

        // Sent as the buyer, because it is the buyer's order - the same message
        // the seller would have received had the order not been held. Sealed,
        // so it reaches them the day they are verified and not before.
        conversationService.postMessage(conversation, order.getBuyer(),
                buildOrderMessage(order, order.getBuyerNote()), true);

        /*
         * Names nothing on purpose. The obvious wording carried the order
         * reference, which the seller could read - a reference is an order
         * detail, and one that unlocks the rest of it wherever else it appears.
         *
         * Kept visible rather than withheld so the seller is not left staring
         * at a thread with nothing in it: they already know from their
         * notification that a sale was handled for them, and this says the same
         * much, no more. The buyer gets the reference in the order message
         * above, which is theirs to see.
         */
        conversationService.postMessage(conversation, admin,
                "Hi - I'm from the CampusMarket team and I'm handling this order "
                        + "personally. Message me here to arrange collection.");

        return conversation;
    }

    private Order loadHeld(Principal principal, UUID orderId) {
        accessGuard.requireAdmin(principal);
        Order order = orderRepository.findByIdWithItems(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
        if (order.getStatus() != OrderStatus.HELD) {
            // Two admins can have the queue open; the second is told what
            // happened rather than silently re-running the action.
            throw ApiException.conflict("ORDER_ALREADY_REVIEWED",
                    "This order has already been reviewed.");
        }
        return order;
    }

    /** Buyer withdrawing before the seller has responded. */
    @Transactional
    public OrderDto cancel(Principal principal, UUID orderId) {
        accessGuard.requireCustomer(principal);
        Order order = orderRepository.findByIdWithItems(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));

        if (!order.getBuyer().getId().equals(principal.id())) {
            throw ApiException.forbidden("You can only cancel your own orders.");
        }
        // HELD counts as cancellable: it is still the buyer's order to withdraw,
        // and being stuck in a review queue is exactly when they might want to.
        if (order.getStatus() != OrderStatus.PENDING && order.getStatus() != OrderStatus.HELD) {
            throw ApiException.conflict("INVALID_ORDER_STATE",
                    "This order has already been responded to and can no longer be cancelled.");
        }
        boolean wasHeld = order.getStatus() == OrderStatus.HELD;

        order.setStatus(OrderStatus.CANCELLED);
        order.setRespondedAt(Instant.now());

        // A held order was never shown to the seller, so telling them now that
        // it was cancelled would reveal an order they were never party to.
        if (!wasHeld) {
            notificationService.notify(order.getSeller(), NotificationType.ORDER,
                    order.getBuyer().getName() + " cancelled an order",
                    "Order " + order.getReference() + " was withdrawn.",
                    orderLink(order));
        }

        return toDto(order, principal, principal.id());
    }

    // ---------------------------------------------------------------- helpers
    /**
     * Where a notification about this order should land.
     *
     * <p>Every order notification used to point at "/orders", the whole list,
     * which put the burden of finding the thing back on the person being told
     * about it - and on a screen split by side and by status, the order in
     * question could be behind either tab. The link names the order.
     *
     * <p>Only ever produced for someone allowed to open it: the held-order
     * paths notify the buyer alone, and the seller's copy is suppressed until
     * an admin releases it.
     */
    private String orderLink(Order order) {
        return "/orders/" + order.getId();
    }

    private Order loadForSeller(Principal principal, UUID orderId) {
        accessGuard.requireOwnerContext(principal);
        Order order = orderRepository.findByIdWithItems(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
        accessGuard.requireOwner(principal, order.getSeller().getId(),
                "You can only manage orders placed with you.");
        // Held orders are invisible to their seller, so acting on one by id must
        // 404 exactly as if it did not exist - anything else leaks its existence.
        if (!order.isVisibleToSeller()) {
            throw ApiException.notFound("Order not found.");
        }
        return order;
    }

    private void requireStatus(Order order, OrderStatus expected, String message) {
        if (order.getStatus() != expected) {
            throw ApiException.conflict("INVALID_ORDER_STATE", message);
        }
    }

    /**
     * Retries on collision rather than assuming uniqueness - six characters from
     * a 32-symbol alphabet is roomy, but "roomy" is not "guaranteed", and the
     * column is UNIQUE.
     */
    private String nextReference() {
        for (int attempt = 0; attempt < 12; attempt++) {
            StringBuilder sb = new StringBuilder("CM-");
            for (int i = 0; i < REFERENCE_LENGTH; i++) {
                sb.append(REFERENCE_ALPHABET.charAt(random.nextInt(REFERENCE_ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (!orderRepository.existsByReference(candidate)) {
                return candidate;
            }
        }
        throw ApiException.conflict("REFERENCE_EXHAUSTED",
                "Could not allocate an order reference. Please try again.");
    }

    /**
     * One-line summary of an order for a notification body.
     *
     * <p>A seller deciding whether to accept needs to know what was ordered,
     * for how much, and where it has to be handed over. "2 item(s) · K350"
     * answered none of that, so every notification meant opening the app to
     * find out whether it was worth opening the app.
     *
     * <p>Item names are listed for the first two lines and summarised after
     * that, because this has to survive being rendered as an OS notification
     * on a phone, where anything past roughly a hundred characters is cut.
     */
    private String describeOrder(Order order) {
        List<OrderItem> items = order.getItems();
        String named = items.stream()
                .limit(2)
                .map(item -> item.getQuantity() + "x " + item.getTitleSnapshot())
                .collect(Collectors.joining(", "));
        if (items.size() > 2) {
            named += " +" + (items.size() - 2) + " more";
        }

        StringBuilder sb = new StringBuilder(named)
                .append(" · ").append(Money.format(order.getTotal()));
        if (order.getMeetupZone() != null) {
            sb.append(" · ").append(order.getMeetupZone().label());
        }
        // Flagged rather than quoted: the note can be long, and the seller is
        // one tap from reading it in full.
        if (order.getBuyerNote() != null && !order.getBuyerNote().isBlank()) {
            sb.append(" · note attached");
        }
        return sb.append(" · ref ").append(order.getReference()).toString();
    }

    private String buildOrderMessage(Order order, String note) {
        String lines = order.getItems().stream()
                .map(item -> "• " + item.getTitleSnapshot()
                        + " x" + item.getQuantity()
                        + " (" + Money.format(item.getUnitPrice()) + " each)")
                .collect(Collectors.joining("\n"));

        StringBuilder sb = new StringBuilder("Order ").append(order.getReference()).append("\n")
                .append(lines)
                .append("\nTotal: ").append(Money.format(order.getTotal()));
        if (order.getMeetupZone() != null) {
            sb.append("\nPickup zone: ").append(order.getMeetupZone().label());
        }
        if (note != null) {
            sb.append("\nNote: ").append(note);
        }
        // This thread is where pickup gets arranged, but accepting happens on
        // the Orders screen - and a seller who replies here assuming that
        // counts as accepting leaves the buyer waiting on a decision that was
        // never recorded.
        sb.append("\n\nAccept or decline this order on your Orders screen. "
                + "Use this chat to arrange the handover.");
        return sb.toString();
    }

    private CampusZone parseZone(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return CampusZone.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_ZONE",
                    "Choose Downschool, Upschool or Across.");
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * {@code viewerId} is null when an admin is looking at the review queue -
     * they are neither party, so they are shown the seller as the counterparty
     * (the person the decision is about) and offered no trading actions.
     */
    private OrderDto toDto(Order order, Principal principal, UUID viewerId) {
        boolean isBuyer = viewerId != null && order.getBuyer().getId().equals(viewerId);
        boolean isParty = viewerId != null && order.involves(viewerId);
        User counterparty = isBuyer ? order.getSeller() : order.getBuyer();
        if (!isParty) {
            counterparty = order.getSeller();
        }

        List<OrderItemDto> items = order.getItems().stream()
                .map(item -> new OrderItemDto(
                        item.getId(),
                        item.getListing() == null ? null : item.getListing().getId(),
                        item.getTitleSnapshot(),
                        item.getImageSnapshot(),
                        item.getUnitPrice(),
                        item.getQuantity(),
                        item.lineTotal()))
                .toList();

        /*
         * The buyer, for admins only.
         *
         * A held order is a decision about the seller, so the queue shows them
         * as the counterparty - but the decision is whether to hand this order
         * to that seller or supply it directly, and "fulfil" means an admin
         * personally meeting the buyer. Withholding who that is left them
         * choosing, and then arranging a handover, blind. The two trading
         * parties are unaffected: they already hold each other's details, and
         * an unverified seller cannot reach a held order at all.
         */
        UserDtos.PublicUserDto buyerDto =
                principal.isAdmin() ? mapper.user(order.getBuyer(), principal) : null;

        return new OrderDto(
                order.getId(),
                order.getReference(),
                mapper.user(counterparty, principal),
                buyerDto,
                isBuyer ? "buyer" : "seller",
                order.getStatus().name(),
                order.getTotal() == null ? BigDecimal.ZERO : order.getTotal(),
                order.getMeetupZone() == null ? null : order.getMeetupZone().name(),
                order.getBuyerNote(),
                order.getSellerNote(),
                order.getAdminNote(),
                order.getFulfilledByAdmin() == null
                        ? null : order.getFulfilledByAdmin().getName(),
                items,
                items.size(),
                availableActions(order, isParty, isBuyer),
                order.getRespondedAt(),
                order.getCompletedAt(),
                order.getCreatedAt());
    }

    /**
     * Computed server-side so the UI never has to encode the state machine - it
     * just renders whatever buttons come back.
     */
    private List<String> availableActions(Order order, boolean isParty, boolean isBuyer) {
        // An admin viewing the review queue is neither party: theirs are the two
        // middleman actions, and only while the order is still held.
        if (!isParty) {
            return order.getStatus() == OrderStatus.HELD
                    ? List.of("release", "fulfil")
                    : List.of();
        }
        if (isBuyer) {
            // A held order can still be withdrawn - it is the buyer's to cancel
            // whether or not the seller has been let near it yet.
            return switch (order.getStatus()) {
                case PENDING, HELD -> List.of("cancel");
                default -> List.of();
            };
        }
        return switch (order.getStatus()) {
            case PENDING -> List.of("accept", "decline");
            case ACCEPTED -> List.of("complete");
            default -> List.of();
        };
    }
}
