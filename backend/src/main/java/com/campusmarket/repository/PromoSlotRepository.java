package com.campusmarket.repository;

import com.campusmarket.domain.PromoPlacement;
import com.campusmarket.domain.PromoSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PromoSlotRepository extends JpaRepository<PromoSlot, UUID> {

    /** What the public home page renders. */
    List<PromoSlot> findByActiveTrueOrderByPlacementAscSortOrderAsc();

    /** The admin editor, which needs the hidden ones too. */
    List<PromoSlot> findAllByOrderByPlacementAscSortOrderAsc();

    List<PromoSlot> findByPlacementOrderBySortOrderAsc(PromoPlacement placement);
}
