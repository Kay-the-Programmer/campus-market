package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Workflow 17 - report a listing or a member. */
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private static final CreateReportRequest EMPTY = new CreateReportRequest(null, null, null, null);

    private final ReportService reportService;

    /** No reporter id here on purpose - it is taken from the session (RBAC rule 2). */
    public record CreateReportRequest(String targetType, UUID targetId, String reason, String details) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReportService.ReportReceiptDto create(@AuthPrincipal Principal principal,
                                                 @RequestBody(required = false) CreateReportRequest request) {
        CreateReportRequest body = request == null ? EMPTY : request;
        return reportService.create(
                principal, body.targetType(), body.targetId(), body.reason(), body.details());
    }
}
