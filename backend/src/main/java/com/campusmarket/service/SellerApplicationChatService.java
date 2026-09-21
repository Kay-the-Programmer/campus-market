package com.campusmarket.service;

import com.campusmarket.domain.NotificationType;
import com.campusmarket.domain.SellerApprovalStatus;
import com.campusmarket.domain.SellerApplicationMessage;
import com.campusmarket.domain.User;
import com.campusmarket.repository.SellerApplicationMessageRepository;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The conversation an admin can have with someone applying to sell, before
 * deciding.
 *
 * <p>The approval decision used to be binary and blind: an admin saw the
 * applicant's record and chose approve or decline, with no way to ask "what
 * will you be selling?" or "can you confirm your campus address?" - and an
 * applicant declined for a fixable reason had no way to answer except to
 * apply again into the same silence. This is that missing exchange.
 *
 * <p>Two rules give it its shape:
 * <ul>
 *   <li><b>Admins may write to anyone who has applied</b> - pending, refused,
 *       or since approved. Not to someone who never applied: there is no
 *       application to talk about, and this must not become a general
 *       admin-to-user channel.</li>
 *   <li><b>Applicants may write while their application is pending or was
 *       refused</b>, and may always read. Once approved, the conversation is
 *       over; a seller with a question uses the ordinary channels.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class SellerApplicationChatService {

    private static final int MAX_BODY_CHARS = 2000;

    private final SellerApplicationMessageRepository messageRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final AccessGuard accessGuard;

    public record MessageDto(
            UUID id,
            boolean fromAdmin,
            String senderName,
            String body,
            Instant createdAt,
            /** Whether the recipient side has opened the thread since this was written. */
            boolean read
    ) {}

    /**
     * The whole thread, and a side-effect: opening it marks the other side's
     * messages read. That is what "read" means here - the thread was shown to
     * the person it was written to - and doing it on read rather than by a
     * separate call means no client can forget to.
     */
    @Transactional
    public List<MessageDto> thread(Principal principal, UUID applicantId) {
        User applicant = requireApplicantAccess(principal, applicantId);

        // The reader marks the OTHER side's messages read: an admin opening
        // the thread has read what the applicant wrote, and vice versa.
        boolean readerIsAdmin = principal.isAdmin();
        messageRepository.markRead(applicant.getId(), !readerIsAdmin, Instant.now());

        return messageRepository.findByApplicantIdOrderByCreatedAtAsc(applicant.getId()).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public MessageDto post(Principal principal, UUID applicantId, String rawBody) {
        User applicant = requireApplicantAccess(principal, applicantId);

        String body = rawBody == null ? "" : rawBody.trim();
        if (body.isEmpty()) {
            throw ApiException.badRequest("EMPTY_MESSAGE", "Write a message first.");
        }
        if (body.length() > MAX_BODY_CHARS) {
            throw ApiException.badRequest("MESSAGE_TOO_LONG",
                    "Keep it under " + MAX_BODY_CHARS + " characters.");
        }

        boolean fromAdmin = principal.isAdmin();
        if (!fromAdmin && applicant.getSellerApprovalStatus() == SellerApprovalStatus.APPROVED) {
            // Nothing left to discuss on the application itself.
            throw ApiException.badRequest("APPLICATION_CLOSED",
                    "Your application has been approved - this conversation is closed.");
        }

        SellerApplicationMessage message = new SellerApplicationMessage();
        message.setApplicant(applicant);
        message.setSender(principal.user());
        message.setFromAdmin(fromAdmin);
        message.setBody(body);
        SellerApplicationMessage saved = messageRepository.save(message);

        /*
         * Only the applicant is notified. An admin's inbox is the console -
         * the pending queue badges rows with unread replies - whereas an
         * applicant is off browsing and would otherwise never learn an admin
         * had a question. MODERATION type: it concerns their account and
         * cannot be muted, which is right for a message that may be the
         * difference between approval and refusal.
         */
        if (fromAdmin) {
            notificationService.notify(applicant, NotificationType.MODERATION,
                    "A message about your seller application",
                    preview(body),
                    "/sell");
        }
        return toDto(saved);
    }

    /** Unread-from-applicant counts by applicant id, for badging the pending queue. */
    @Transactional(readOnly = true)
    public Map<UUID, Long> unreadFromApplicants(Principal principal) {
        accessGuard.requireAdmin(principal);
        return messageRepository.unreadFromApplicantsById();
    }

    /** How many admin messages this user has not yet seen - for their own badge. */
    @Transactional(readOnly = true)
    public long unreadFromAdmin(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        return messageRepository.countByApplicantIdAndFromAdminAndReadAtIsNull(principal.id(), true);
    }

    /**
     * Who may touch this thread, and confirms there is one to touch.
     *
     * <p>Returns the applicant so callers do not load them twice. An admin
     * may reach any applicant; anyone else only themselves - and the check is
     * on the id, not the status, so an applicant can always read their own
     * thread even after the decision.
     */
    private User requireApplicantAccess(Principal principal, UUID applicantId) {
        accessGuard.requireAuthenticated(principal);
        if (!principal.isAdmin() && !principal.id().equals(applicantId)) {
            throw ApiException.forbidden("This conversation is not yours.");
        }
        User applicant = userRepository.findById(applicantId)
                .orElseThrow(() -> ApiException.notFound("Applicant not found."));
        if (applicant.getSellerApprovalStatus() == SellerApprovalStatus.NOT_REQUESTED) {
            throw ApiException.badRequest("NO_APPLICATION",
                    "There is no seller application to discuss.");
        }
        return applicant;
    }

    private MessageDto toDto(SellerApplicationMessage m) {
        User sender = m.getSender();
        String senderName = sender != null ? sender.getName()
                : m.isFromAdmin() ? "CampusMarket admin" : "Applicant";
        return new MessageDto(m.getId(), m.isFromAdmin(), senderName, m.getBody(),
                m.getCreatedAt(), m.getReadAt() != null);
    }

    private static String preview(String body) {
        String oneLine = body.replaceAll("\\s+", " ");
        return oneLine.length() <= 120 ? oneLine : oneLine.substring(0, 117) + "...";
    }
}
