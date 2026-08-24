package com.campusmarket.repository;

import com.campusmarket.domain.Role;
import com.campusmarket.domain.SellerApprovalStatus;
import com.campusmarket.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    Optional<User> findByGoogleUid(String googleUid);

    boolean existsByEmail(String email);

    List<User> findAllByOrderByCreatedAtDesc();

    long countByRole(Role role);

    /** The seller approval queue - longest-waiting first, so nobody is stranded. */
    List<User> findBySellerApprovalStatusOrderBySellerRequestedAtAsc(SellerApprovalStatus status);

    long countBySellerApprovalStatus(SellerApprovalStatus status);
}
