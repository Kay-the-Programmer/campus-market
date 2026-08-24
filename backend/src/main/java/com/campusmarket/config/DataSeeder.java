package com.campusmarket.config;

import com.campusmarket.domain.*;
import com.campusmarket.repository.CategoryRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/**
 * Seeds demo content on an empty database.
 *
 * <p>Lives in Java rather than a Flyway script so passwords are hashed with the
 * application's own encoder - a hard-coded BCrypt string in SQL is easy to get
 * subtly wrong and leaves accounts that cannot log in.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements CommandLineRunner {

    private static final String DEMO_PASSWORD = "Password123";
    private static final String ADMIN_PASSWORD = "Admin123!";

    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final ListingRepository listingRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.count() > 0) {
            log.info("Database already seeded - skipping demo data.");
            return;
        }
        log.info("Seeding demo data...");

        Category textbooks = category("Textbooks", "book-open", 1);
        Category electronics = category("Electronics", "laptop", 2);
        Category food = category("Food & Snacks", "utensils", 3);
        Category tutoring = category("Tutoring", "graduation-cap", 4);
        category("Furniture", "armchair", 5);
        category("Clothing", "shirt", 6);
        category("Sports & Outdoors", "bike", 7);
        category("Tickets & Events", "ticket", 8);

        User admin = user("Campus Marketplace Admin", "admin@campus.edu", ADMIN_PASSWORD,
                Role.ADMIN, "Campus IT & Safety", "Staff",
                "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80");
        admin.setPhone("+1 (800) 555-0000");
        admin.setPrivateAddress("Admin Building Room 300");
        admin.setCampusZone(CampusZone.ACROSS);

        User alex = user("Alex Rivers", "alex.rivers@campus.edu", DEMO_PASSWORD,
                Role.CUSTOMER, "Faculty of Engineering", "Senior Student",
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80");
        alex.setBio("Engineering student selling gently used electronics and textbooks.");
        alex.setPhone("+1 (555) 382-9921");
        alex.setPrivateAddress("Engineering Dorms B, Room 109");
        alex.setAccountType(AccountType.SELLER);
        alex.setSellerApprovalStatus(SellerApprovalStatus.APPROVED);
        alex.setCampusZone(CampusZone.UPSCHOOL);

        User john = user("John Doe", "john.doe@campus.edu", DEMO_PASSWORD,
                Role.CUSTOMER, "School of Economics", "Junior Student",
                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80");
        john.setPhone("+1 (555) 837-1209");
        john.setPrivateAddress("Economics Quad #4");
        john.setAccountType(AccountType.SELLER);
        john.setSellerApprovalStatus(SellerApprovalStatus.APPROVED);
        john.setCampusZone(CampusZone.DOWNSCHOOL);

        User sarah = user("Sarah Jenkins", "sarah.j@campus.edu", DEMO_PASSWORD,
                Role.CUSTOMER, "Biology Department", "Sophomore",
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80");
        sarah.setPhone("+1 (555) 771-0023");
        sarah.setPrivateAddress("Hall 4 Dorm Kitchen");
        sarah.setAccountType(AccountType.SELLER);
        sarah.setSellerApprovalStatus(SellerApprovalStatus.APPROVED);
        sarah.setCampusZone(CampusZone.DOWNSCHOOL);

        User marcus = user("Marcus Chen", "marcus.c@campus.edu", DEMO_PASSWORD,
                Role.CUSTOMER, "Computer Science", "Graduate Student",
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80");
        marcus.setPhone("+1 (555) 991-8844");
        marcus.setPrivateAddress("Graduate Housing A-101");
        marcus.setAccountType(AccountType.SELLER);
        // Deliberately approved but NOT verified: demonstrates the held-order
        // path, where orders on his listings wait for an admin.
        marcus.setSellerApprovalStatus(SellerApprovalStatus.APPROVED);
        marcus.setVerified(false);
        marcus.setCampusZone(CampusZone.ACROSS);

        // Emma is deliberately a BUYER with no listings: she demonstrates the
        // plain customer navigation, the blocked Sell button, and the
        // "become a seller" upgrade path that the others have already taken.
        User emma = user("Emma Watson", "emma.w@campus.edu", DEMO_PASSWORD,
                Role.CUSTOMER, "School of Arts", "Sophomore",
                "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80");
        emma.setBio("Art and Literature student.");
        emma.setAccountType(AccountType.BUYER);
        emma.setSellerApprovalStatus(SellerApprovalStatus.NOT_REQUESTED);
        emma.setCampusZone(CampusZone.UPSCHOOL);

        userRepository.saveAll(List.of(admin, alex, john, sarah, marcus, emma));

        Listing headphones = listing(john, ListingType.PRODUCT, electronics,
                "Sony WH-1000XM4 Noise Cancelling Headphones", new BigDecimal("180.00"),
                "Selling my Sony XM4s as I upgraded. Excellent condition, no scratches or scuffs. "
                        + "Battery life is still incredible (about 30 hours). Comes with the original "
                        + "case and USB-C charging cable.",
                "Main Campus Library");
        headphones.setCondition(ListingCondition.LIKE_NEW);
        headphones.setBrand("Sony");
        headphones.addImage("https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80");
        headphones.addImage("https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80");

        Listing pasta = listing(sarah, ListingType.FOOD, food,
                "Homemade Pasta Dinner Bowl", new BigDecimal("12.00"),
                "Fresh homemade pasta tossed with rich tomato garlic sauce, cherry tomatoes and basil. "
                        + "Prepared cleanly in the Hall 4 dorm kitchen.",
                "Hall 4 Dorm Kitchen");
        pasta.setQuantity(4);
        pasta.setPickupWindow("Today until 7:00 PM");
        pasta.setDietaryTags(Set.of("Vegetarian", "Contains gluten"));
        pasta.addImage("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80");

        Listing tutoringListing = listing(alex, ListingType.SERVICE, tutoring,
                "Calculus 101 & Linear Algebra Tutoring", new BigDecimal("25.00"),
                "Struggling with Calculus or Linear Algebra? I'm a senior engineering student offering "
                        + "1-on-1 sessions tailored to midterm and final exam prep.",
                "Student Center or Zoom");
        tutoringListing.setPriceUnit("/hr");
        tutoringListing.setRateType(RateType.HOURLY);
        tutoringListing.setAvailability("Weekdays after 4pm, Saturday mornings");
        tutoringListing.addImage("https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80");

        Listing keyboard = listing(marcus, ListingType.PRODUCT, electronics,
                "Keychron K2 Mechanical Wireless Keyboard", new BigDecimal("75.00"),
                "Wireless mechanical keyboard with Gateron Brown tactile switches. Connects over "
                        + "Bluetooth to up to 3 devices, or wired via USB-C.",
                "Computer Science Bldg");
        keyboard.setCondition(ListingCondition.LIKE_NEW);
        keyboard.setBrand("Keychron");
        keyboard.addImage("https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80");

        Listing calcTextbook = listing(alex, ListingType.PRODUCT, textbooks,
                "Stewart Calculus: Early Transcendentals (8th Ed.)", new BigDecimal("45.00"),
                "Standard first-year calculus text. Some highlighting in the first three chapters, "
                        + "binding is solid.",
                "Engineering Library");
        calcTextbook.setCondition(ListingCondition.GOOD);
        calcTextbook.addImage("https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80");

        listingRepository.saveAll(List.of(headphones, pasta, tutoringListing, keyboard, calcTextbook));

        log.info("""

                Demo data ready.
                  admin@campus.edu        / {}   (admin console)
                  alex.rivers@campus.edu  / {}   (seller - has listings)
                  emma.w@campus.edu       / {}   (customer - no listings)
                """, ADMIN_PASSWORD, DEMO_PASSWORD, DEMO_PASSWORD);
    }

    private Category category(String name, String icon, int order) {
        Category category = new Category();
        category.setName(name);
        category.setSlug(name.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""));
        category.setIcon(icon);
        category.setSortOrder(order);
        return categoryRepository.save(category);
    }

    private User user(String name, String email, String password, Role role,
                      String department, String year, String avatar) {
        User user = new User();
        user.setName(name);
        user.setEmail(email.toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRole(role);
        user.setEmailVerified(true);
        user.setVerified(true);
        user.setDepartment(department);
        user.setYear(year);
        user.setAvatarUrl(avatar);
        return user;
    }

    private Listing listing(User seller, ListingType type, Category category,
                            String title, BigDecimal price, String description, String location) {
        Listing listing = new Listing();
        listing.setSeller(seller);
        listing.setType(type);
        listing.setCategory(category);
        listing.setTitle(title);
        listing.setPrice(price);
        listing.setDescription(description);
        listing.setLocation(location);
        // Defaults to wherever the seller is based, which is what the Sell form
        // pre-fills too - people overwhelmingly hand over near where they live.
        listing.setCampusZone(seller.getCampusZone());
        listing.setStatus(ListingStatus.ACTIVE);
        return listing;
    }
}
