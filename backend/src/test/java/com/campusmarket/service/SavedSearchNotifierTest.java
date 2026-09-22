package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.SavedSearchRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Who gets told when a listing is published.
 *
 * <p>These are the rules that decide whether a notification interrupts
 * somebody, so the failures worth guarding against are in both directions: an
 * alert that never arrives makes the feature pointless, and an alert about
 * something nobody asked for is how a person switches notifications off for
 * good - losing every future alert with it.
 *
 * <p>Hand-rolled stubs rather than a mocking framework. There are two
 * collaborators and one of them only has to record what it was handed, so the
 * fakes below say more about the expected behaviour than a pile of
 * verify() calls would.
 */
class SavedSearchNotifierTest {

    /** Records every notification instead of delivering one. */
    static class RecordingNotificationService extends NotificationService {
        final List<String> sent = new ArrayList<>();

        RecordingNotificationService() {
            super(null, null, null, null, null);
        }

        @Override
        public void notify(User recipient, NotificationType type, String title, String body, String link) {
            sent.add(recipient.getEmail() + "|" + type + "|" + title);
        }
    }

    /** Returns whatever the test put in it, and remembers what was saved. */
    static class FakeSavedSearchRepository implements SavedSearchRepository {
        List<SavedSearch> active = new ArrayList<>();
        final List<SavedSearch> saved = new ArrayList<>();

        @Override public List<SavedSearch> findByNotifyTrue() { return active; }
        @Override public <S extends SavedSearch> S save(S entity) { saved.add(entity); return entity; }

        // Nothing below is exercised by these tests.
        @Override public List<SavedSearch> findByUserIdOrderByCreatedAtDesc(UUID userId) { return List.of(); }
        @Override public Optional<SavedSearch> findByIdAndUserId(UUID id, UUID userId) { return Optional.empty(); }
        @Override public long countByUserId(UUID userId) { return 0; }
        @Override public List<SavedSearch> findAll() { return List.of(); }
        @Override public List<SavedSearch> findAll(org.springframework.data.domain.Sort sort) { return List.of(); }
        @Override public org.springframework.data.domain.Page<SavedSearch> findAll(org.springframework.data.domain.Pageable p) { return org.springframework.data.domain.Page.empty(); }
        @Override public List<SavedSearch> findAllById(Iterable<UUID> ids) { return List.of(); }
        @Override public <S extends SavedSearch> List<S> saveAll(Iterable<S> e) { return List.of(); }
        @Override public Optional<SavedSearch> findById(UUID id) { return Optional.empty(); }
        @Override public boolean existsById(UUID id) { return false; }
        @Override public long count() { return 0; }
        @Override public void deleteById(UUID id) {}
        @Override public void delete(SavedSearch e) {}
        @Override public void deleteAllById(Iterable<? extends UUID> ids) {}
        @Override public void deleteAll(Iterable<? extends SavedSearch> e) {}
        @Override public void deleteAll() {}
        @Override public void flush() {}
        @Override public <S extends SavedSearch> S saveAndFlush(S entity) { saved.add(entity); return entity; }
        @Override public <S extends SavedSearch> List<S> saveAllAndFlush(Iterable<S> e) { return List.of(); }
        @Override public void deleteAllInBatch(Iterable<SavedSearch> e) {}
        @Override public void deleteAllByIdInBatch(Iterable<UUID> ids) {}
        @Override public void deleteAllInBatch() {}
        @Override public SavedSearch getOne(UUID id) { return null; }
        @Override public SavedSearch getById(UUID id) { return null; }
        @Override public SavedSearch getReferenceById(UUID id) { return null; }
        @Override public <S extends SavedSearch> Optional<S> findOne(org.springframework.data.domain.Example<S> ex) { return Optional.empty(); }
        @Override public <S extends SavedSearch> List<S> findAll(org.springframework.data.domain.Example<S> ex) { return List.of(); }
        @Override public <S extends SavedSearch> List<S> findAll(org.springframework.data.domain.Example<S> ex, org.springframework.data.domain.Sort s) { return List.of(); }
        @Override public <S extends SavedSearch> org.springframework.data.domain.Page<S> findAll(org.springframework.data.domain.Example<S> ex, org.springframework.data.domain.Pageable p) { return org.springframework.data.domain.Page.empty(); }
        @Override public <S extends SavedSearch> long count(org.springframework.data.domain.Example<S> ex) { return 0; }
        @Override public <S extends SavedSearch> boolean exists(org.springframework.data.domain.Example<S> ex) { return false; }
        @Override public <S extends SavedSearch, R> R findBy(org.springframework.data.domain.Example<S> ex, Function<org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery<S>, R> fn) { return null; }
    }

    private FakeSavedSearchRepository searches;
    private RecordingNotificationService notifications;
    private SavedSearchNotifier notifier;

    private User watcher;
    private User seller;
    private Category textbooks;

    @BeforeEach
    void setUp() {
        searches = new FakeSavedSearchRepository();
        notifications = new RecordingNotificationService();
        notifier = new SavedSearchNotifier(searches, notifications);

        watcher = user("watcher@campus.edu");
        seller = user("seller@campus.edu");

        textbooks = new Category();
        textbooks.setId(UUID.randomUUID());
        textbooks.setName("Textbooks");
    }

    private User user(String email) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail(email);
        u.setName(email);
        return u;
    }

    /** An ACTIVE product listing, which every test then varies one field of. */
    private Listing listing(String title, BigDecimal price) {
        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setTitle(title);
        l.setDescription("A description.");
        l.setPrice(price);
        l.setType(ListingType.PRODUCT);
        l.setStatus(ListingStatus.ACTIVE);
        l.setSeller(seller);
        l.setCampusZone(CampusZone.DOWNSCHOOL);
        return l;
    }

    private SavedSearch search(User owner) {
        SavedSearch s = new SavedSearch();
        s.setId(UUID.randomUUID());
        s.setUser(owner);
        s.setLabel("a search");
        s.setNotify(true);
        return s;
    }

    private void watching(SavedSearch s) {
        searches.active = new ArrayList<>(List.of(s));
    }

    // ------------------------------------------------------------- matching

    @Test
    @DisplayName("a free-text search matches on the title")
    void matchesTitle() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        watching(s);

        notifier.listingPublished(listing("Dell 24 inch monitor", new BigDecimal("300")));

        assertThat(notifications.sent).hasSize(1);
        assertThat(notifications.sent.get(0)).contains("watcher@campus.edu", "SAVED_UPDATE");
    }

    @Test
    @DisplayName("a free-text search that matches nothing stays quiet")
    void noMatchNoAlert() {
        SavedSearch s = search(watcher);
        s.setQuery("bicycle");
        watching(s);

        notifier.listingPublished(listing("Dell 24 inch monitor", new BigDecimal("300")));

        assertThat(notifications.sent).isEmpty();
    }

    @Test
    @DisplayName("a price ceiling excludes anything dearer")
    void respectsMaxPrice() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        s.setMaxPrice(new BigDecimal("500"));
        watching(s);

        notifier.listingPublished(listing("Gold monitor", new BigDecimal("9000")));
        assertThat(notifications.sent).isEmpty();

        notifier.listingPublished(listing("Plain monitor", new BigDecimal("300")));
        assertThat(notifications.sent).hasSize(1);
    }

    @Test
    @DisplayName("filters are ANDed - matching the words is not enough on its own")
    void filtersAreAnded() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        s.setCampusZone("UPSCHOOL");
        watching(s);

        // Right words, wrong side of campus.
        notifier.listingPublished(listing("Dell monitor", new BigDecimal("300")));

        assertThat(notifications.sent).isEmpty();
    }

    @Test
    @DisplayName("an absent filter means any, not none")
    void nullFilterMatchesAnything() {
        SavedSearch s = search(watcher);
        s.setType("PRODUCT");
        // No query, no category, no zone, no price.
        watching(s);

        notifier.listingPublished(listing("Anything at all", new BigDecimal("42")));

        assertThat(notifications.sent).hasSize(1);
    }

    @Test
    @DisplayName("a category filter only matches that category")
    void respectsCategory() {
        SavedSearch s = search(watcher);
        s.setCategory(textbooks);
        watching(s);

        Listing uncategorised = listing("A thing", new BigDecimal("10"));
        notifier.listingPublished(uncategorised);
        assertThat(notifications.sent).isEmpty();

        Listing inCategory = listing("A textbook", new BigDecimal("10"));
        inCategory.setCategory(textbooks);
        notifier.listingPublished(inCategory);
        assertThat(notifications.sent).hasSize(1);
    }

    // ------------------------------------------------------------ restraint

    @Test
    @DisplayName("a seller is never told about their own listing")
    void neverNotifiesTheSeller() {
        SavedSearch s = search(seller);
        s.setQuery("monitor");
        watching(s);

        notifier.listingPublished(listing("Dell monitor", new BigDecimal("300")));

        assertThat(notifications.sent).isEmpty();
    }

    @Test
    @DisplayName("at most one alert per search per quiet period")
    void rateLimitsPerSearch() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        watching(s);

        notifier.listingPublished(listing("First monitor", new BigDecimal("100")));
        notifier.listingPublished(listing("Second monitor", new BigDecimal("110")));

        // Five alerts in a row is how someone turns notifications off for good.
        assertThat(notifications.sent).hasSize(1);
    }

    @Test
    @DisplayName("the quiet period expires, so a later match still arrives")
    void alertsResumeAfterTheQuietPeriod() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        s.setLastNotifiedAt(Instant.now().minus(3, ChronoUnit.HOURS));
        watching(s);

        notifier.listingPublished(listing("Dell monitor", new BigDecimal("300")));

        assertThat(notifications.sent).hasSize(1);
    }

    @Test
    @DisplayName("a draft is not a publication")
    void ignoresNonActiveListings() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        watching(s);

        Listing draft = listing("Draft monitor", new BigDecimal("300"));
        draft.setStatus(ListingStatus.DRAFT);
        notifier.listingPublished(draft);

        assertThat(notifications.sent).isEmpty();
    }

    @Test
    @DisplayName("a removed listing alerts nobody")
    void ignoresDeletedListings() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        watching(s);

        Listing removed = listing("Gone monitor", new BigDecimal("300"));
        removed.setDeleted(true);
        notifier.listingPublished(removed);

        assertThat(notifications.sent).isEmpty();
    }

    @Test
    @DisplayName("a match stamps the search, so the rate limit has something to read")
    void recordsWhenItFired() {
        SavedSearch s = search(watcher);
        s.setQuery("monitor");
        watching(s);

        notifier.listingPublished(listing("Dell monitor", new BigDecimal("300")));

        assertThat(searches.saved).hasSize(1);
        assertThat(searches.saved.get(0).getLastNotifiedAt()).isNotNull();
    }

    @Test
    @DisplayName("a failure in here never escapes to the seller publishing")
    void swallowsItsOwnFailures() {
        searches.active = null; // findByNotifyTrue will NPE downstream

        // Publishing must succeed even when the alert pass cannot run at all.
        notifier.listingPublished(listing("Dell monitor", new BigDecimal("300")));

        assertThat(notifications.sent).isEmpty();
    }
}
