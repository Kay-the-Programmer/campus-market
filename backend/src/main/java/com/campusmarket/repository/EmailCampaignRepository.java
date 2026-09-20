package com.campusmarket.repository;

import com.campusmarket.domain.EmailCampaign;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EmailCampaignRepository extends JpaRepository<EmailCampaign, UUID> {

    /** Newest first - the admin list is a history, and the last send is the
     *  one anyone is checking on. */
    List<EmailCampaign> findTop50ByOrderByCreatedAtDesc();
}
