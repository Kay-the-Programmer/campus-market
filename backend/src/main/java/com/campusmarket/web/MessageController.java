package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.BookingService;
import com.campusmarket.service.ConversationService;
import com.campusmarket.web.dto.MessagingDtos.ConversationDetailDto;
import com.campusmarket.web.dto.MessagingDtos.ConversationSummaryDto;
import com.campusmarket.web.dto.MessagingDtos.MessageDto;
import com.campusmarket.web.request.CommerceRequests.BookingRequest;
import com.campusmarket.web.request.CommerceRequests.SendMessageRequest;
import com.campusmarket.web.request.CommerceRequests.StartChatRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class MessageController {

    private final ConversationService conversationService;
    private final BookingService bookingService;

    @GetMapping("/api/messages")
    public Map<String, List<ConversationSummaryDto>> threads(@AuthPrincipal Principal principal) {
        return Map.of("threads", conversationService.listForUser(principal));
    }

    @GetMapping("/api/messages/{id}")
    public Map<String, ConversationDetailDto> thread(@AuthPrincipal Principal principal,
                                                     @PathVariable UUID id) {
        return Map.of("thread", conversationService.getThread(principal, id));
    }

    @PostMapping("/api/messages/{id}/send")
    public Map<String, Object> send(@AuthPrincipal Principal principal,
                                    @PathVariable UUID id,
                                    @Valid @RequestBody SendMessageRequest request) {
        MessageDto message = conversationService.send(principal, id, request.body());
        return Map.of("success", true, "message", message);
    }

    /** "Chat with Seller" from a listing detail page (workflow 15). */
    @PostMapping("/api/listings/{listingId}/chat")
    public Map<String, ConversationDetailDto> startChat(@AuthPrincipal Principal principal,
                                                        @PathVariable UUID listingId,
                                                        @RequestBody(required = false) StartChatRequest request) {
        String body = request == null ? null : request.body();
        return Map.of("thread", conversationService.startFromListing(principal, listingId, body));
    }

    /** Service booking request (workflow 14). */
    @PostMapping("/api/listings/{listingId}/booking")
    public Map<String, Object> requestBooking(@AuthPrincipal Principal principal,
                                              @PathVariable UUID listingId,
                                              @Valid @RequestBody BookingRequest request) {
        return bookingService.requestBooking(principal, listingId, request.preferredTime(), request.note());
    }
}
