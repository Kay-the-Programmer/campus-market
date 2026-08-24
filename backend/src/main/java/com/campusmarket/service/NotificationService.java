package com.campusmarket.service;

import com.campusmarket.domain.Notification;
import com.campusmarket.domain.NotificationType;
import com.campusmarket.domain.User;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.NotificationRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ModerationDtos.NotificationDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final ListingRepository listingRepository;
    private final PushNotificationService pushNotificationService;
    private final AccessGuard accessGuard;

    /**
     * Fire-and-forget creation used by the other workflows.
     *
     * <p>Every caller of this method also gets a push, which is the point: one
     * call site per event, two deliveries. Nothing needs to opt in, so a new
     * workflow that notifies is pushable the day it ships.
     */
    @Transactional
    public void notify(User recipient, NotificationType type, String title, String body, String link) {
        if (recipient == null) {
            return;
        }
        Notification notification = new Notification();
        notification.setUser(recipient);
        notification.setType(type);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setLink(link);
        notificationRepository.save(notification);

        pushAfterCommit(recipient.getId(), type, title, body, link, notification.getId());
    }

    /**
     * Pushes are queued for after the commit, never during it. Sending inside
     * the transaction would mean a user whose order failed to save still gets
     * told it succeeded - and a device tapping the deep link before the row is
     * visible to other connections.
     */
    private void pushAfterCommit(UUID userId, NotificationType type, String title,
                                 String body, String link, UUID notificationId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            pushNotificationService.send(userId, type, title, body, link, notificationId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                pushNotificationService.send(userId, type, title, body, link, notificationId);
            }
        });
    }

    @Transactional(readOnly = true)
    public List<NotificationDto> list(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(principal.id()).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(Principal principal, UUID notificationId) {
        accessGuard.requireAuthenticated(principal);
        // Scoped by user id, so one user cannot mark another's notification read.
        notificationRepository.findByIdAndUserId(notificationId, principal.id())
                .ifPresent(n -> n.setRead(true));
    }

    @Transactional
    public int markAllRead(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        return notificationRepository.markAllRead(principal.id());
    }

    private NotificationDto toDto(Notification n) {
        return new NotificationDto(
                n.getId(),
                n.getType().name(),
                n.getTitle(),
                n.getBody(),
                n.getLink(),
                n.isRead(),
                isLinkStillValid(n.getLink()),
                n.getCreatedAt());
    }

    /**
     * A notification outlives the thing it points at. Rather than hiding it, the
     * response marks the link dead so the UI can say "no longer available"
     * instead of navigating into a 404 (workflow 18).
     */
    private boolean isLinkStillValid(String link) {
        if (link == null || !link.startsWith("/listing/")) {
            return true;
        }
        String id = link.substring("/listing/".length());
        try {
            return listingRepository.findByIdAndDeletedFalse(UUID.fromString(id)).isPresent();
        } catch (IllegalArgumentException malformedUuid) {
            return false;
        }
    }
}
