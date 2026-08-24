package com.campusmarket.repository;

import com.campusmarket.domain.PushDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PushDeviceRepository extends JpaRepository<PushDevice, UUID> {

    List<PushDevice> findByUserId(UUID userId);

    Optional<PushDevice> findByToken(String token);

    void deleteByToken(String token);

    void deleteByUserIdAndToken(UUID userId, String token);
}
