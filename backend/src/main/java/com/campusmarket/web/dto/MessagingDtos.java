package com.campusmarket.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MessagingDtos {
    private MessagingDtos() {}

    public record MessageDto(
            UUID id,
            UUID senderId,
            boolean mine,
            String body,
            Instant createdAt,
            Instant readAt
    ) {}

    public record ConversationSummaryDto(
            UUID id,
            UserDtos.PublicUserDto peer,
            ListingDtos.ListingRefDto listing,
            String lastMessage,
            Instant lastMessageAt,
            long unreadCount,
            String role
    ) {}

    public record ConversationDetailDto(
            UUID id,
            UserDtos.PublicUserDto peer,
            ListingDtos.ListingRefDto listing,
            String role,
            boolean canMarkSold,
            List<MessageDto> messages
    ) {}
}
