import { Listing, SellerProfile, OrderDeal, MessageThread, FAQItem } from '../types';

export const alexRiversProfile: SellerProfile = {
  id: 'user-alex',
  name: 'Alex Rivers',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  verified: true,
  department: 'Faculty of Engineering',
  year: 'Senior Student',
  rating: 4.8,
  reviewsCount: 24,
  joinedDate: 'Joined Oct 2021',
  bio: 'Engineering student selling gently used electronics and textbooks from previous semesters.'
};

export const johnDoeSeller: SellerProfile = {
  id: 'seller-john',
  name: 'John Doe',
  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  verified: true,
  department: 'School of Economics',
  year: 'Junior Student',
  rating: 4.8,
  reviewsCount: 24,
  joinedDate: 'Member since 2022',
};

export const marcusChenSeller: SellerProfile = {
  id: 'seller-marcus',
  name: 'Marcus Chen',
  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  verified: true,
  department: 'Computer Science',
  year: 'Graduate Student',
  rating: 4.9,
  reviewsCount: 38,
  joinedDate: 'Member since 2021',
};

export const sarahJenkinsSeller: SellerProfile = {
  id: 'seller-sarah',
  name: 'Sarah Jenkins',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
  verified: true,
  department: 'Biology Department',
  year: 'Sophomore',
  rating: 5.0,
  reviewsCount: 19,
  joinedDate: 'Member since 2023',
};

export const initialListings: Listing[] = [
  {
    id: 'listing-1',
    title: 'Sony WH-1000XM4',
    price: 1800,
    category: 'Product',
    condition: 'Like New',
    brand: 'Sony',
    location: 'Main Campus',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop&q=80'
    ],
    description: "Selling my Sony XM4s as I've upgraded. These are in perfect condition, no scratches or scuffs. Battery life is still incredible (lasts about 30 hours). Comes with the original case, aux cable, and USB-C charging cable. Best noise cancelling headphones I've ever owned, perfect for studying in the library or long commutes. Firm on price.",
    seller: johnDoeSeller,
    postedAt: '2 days ago',
    isAvailable: true,
    isSaved: true,
    badgeText: 'Available',
    viewsCount: 124,
    likesCount: 18,
  },
  {
    id: 'listing-2',
    title: 'Homemade Pasta Dinner',
    price: 45,
    category: 'Food',
    location: 'Hall 4',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1621996346565-e3d5d6281298?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'Fresh homemade pasta tossed with rich tomato garlic sauce, cherry tomatoes, and basil. Prepared cleanly in Hall 4 dorm kitchen. Great student meal alternative!',
    seller: sarahJenkinsSeller,
    postedAt: 'Today',
    isAvailable: true,
    isSaved: false,
    stockInfo: 'Available until 7PM • 4 left',
    viewsCount: 89,
    likesCount: 22,
  },
  {
    id: 'listing-3',
    title: 'Calculus 101 Tutoring',
    price: 150,
    priceUnit: '/hr',
    category: 'Service',
    location: 'Library Annex',
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'One-on-one Calculus 101 & Linear Algebra tutoring sessions. We can meet in the Library Annex or study rooms. I have an A+ average and 2 years of tutoring experience.',
    seller: marcusChenSeller,
    postedAt: '3 days ago',
    isAvailable: true,
    isSaved: false,
    badgeText: 'Service',
    viewsCount: 156,
    likesCount: 31,
  },
  {
    id: 'listing-4',
    title: 'Biology & Organic Chem Textbooks',
    price: 320,
    category: 'Product',
    condition: 'Good',
    location: 'North Gate',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'Bundle of 4 science textbooks including Campbell Biology and Organic Chemistry. Minimal highlighting inside. Save hundreds compared to bookstore prices.',
    seller: sarahJenkinsSeller,
    postedAt: '4 days ago',
    isAvailable: true,
    isSaved: true,
    badgeText: 'Product',
    viewsCount: 210,
    likesCount: 15,
  },
  {
    id: 'listing-5',
    title: 'Mechanical Keyboard - Keychron K2',
    price: 75,
    category: 'Product',
    condition: 'Like New',
    brand: 'Keychron',
    location: 'Engineering Hall',
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1595225476474-87563907a212?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'Keychron K2 wireless mechanical keyboard, lightly used for one semester. Features tactile blue switches, RGB backlight, and Mac/Windows switch.',
    seller: alexRiversProfile,
    postedAt: 'Posted 2 days ago',
    isAvailable: true,
    isSaved: true,
    badgeText: 'Active',
    viewsCount: 124,
    likesCount: 18,
  },
  {
    id: 'listing-6',
    title: 'Study Desk',
    price: 45,
    category: 'Product',
    condition: 'Good',
    brand: 'IKEA',
    location: 'North Dorms',
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'IKEA Linnmon desk with white finish and birch legs. Sturdy and perfect for dorm rooms or off-campus apartments. Easy disassembly.',
    seller: alexRiversProfile,
    postedAt: 'Posted 5 days ago',
    isAvailable: true,
    isSaved: false,
    badgeText: 'Active',
    viewsCount: 89,
    likesCount: 11,
  },
  {
    id: 'listing-7',
    title: 'Engineering Textbook',
    price: 60,
    category: 'Product',
    condition: 'Like New',
    brand: 'Cengel',
    location: 'Engineering Hub',
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'Thermodynamics: An Engineering Approach. 9th Edition. Absolutely no highlights or torn pages. Must-have for ME201.',
    seller: alexRiversProfile,
    postedAt: 'Posted 1 week ago',
    isAvailable: true,
    isSaved: false,
    badgeText: 'Active',
    viewsCount: 140,
    likesCount: 9,
  },
  {
    id: 'listing-8',
    title: 'Retro City Cruiser Bike',
    price: 120,
    category: 'Product',
    condition: 'Good',
    location: 'Student Union',
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'Vintage 7-speed green commuter bike with front wicker basket. Rides smooth and includes combination U-lock.',
    seller: marcusChenSeller,
    postedAt: 'Posted 1 day ago',
    isAvailable: true,
    isSaved: true,
    badgeText: 'Product',
    viewsCount: 95,
    likesCount: 20,
  },
  {
    id: 'listing-9',
    title: 'Apple AirPods Pro',
    price: 450,
    category: 'Product',
    condition: 'Like New',
    brand: 'Apple',
    location: 'Science Library',
    image: 'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'AirPods Pro 2nd generation with MagSafe charging case. Cleaned and sanitized with fresh tips.',
    seller: johnDoeSeller,
    postedAt: 'Posted today',
    isAvailable: true,
    isSaved: false,
    badgeText: 'Product',
    viewsCount: 310,
    likesCount: 44,
  },
  {
    id: 'listing-10',
    title: 'MacBook Air M2',
    price: 8500,
    category: 'Product',
    condition: 'Like New',
    brand: 'Apple',
    location: 'Main Campus',
    image: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&auto=format&fit=crop&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&auto=format&fit=crop&q=80'
    ],
    description: 'MacBook Air M2 (8GB RAM, 256GB SSD) in Midnight color. Battery cycle count only 42. Comes with original Apple charger and box.',
    seller: marcusChenSeller,
    postedAt: '3 days ago',
    isAvailable: true,
    isSaved: false,
    badgeText: 'Product',
    viewsCount: 420,
    likesCount: 52,
  }
];

export const mockOrders: OrderDeal[] = [
  {
    id: 'order-1',
    listingId: 'listing-1',
    title: 'Sony WH-1000XM4',
    price: 1800,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    counterpartyName: 'Alex Rivers',
    role: 'buyer',
    date: 'Oct 24, 2023',
    status: 'Completed'
  },
  {
    id: 'order-2',
    listingId: 'listing-8',
    title: 'Retro City Cruiser',
    price: 120,
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80',
    counterpartyName: 'Marcus Chen',
    role: 'seller',
    date: 'Oct 15, 2023',
    status: 'Sold',
    rating: 5.0
  },
  {
    id: 'order-3',
    listingId: 'listing-4',
    title: 'Textbook Bundle',
    price: 45,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
    counterpartyName: 'Sarah Jenkins',
    role: 'buyer',
    date: 'Oct 10, 2023',
    status: 'Completed'
  }
];

export const mockMessages: MessageThread[] = [
  {
    id: 'thread-1',
    peerName: 'John Doe',
    peerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    lastMessage: 'Sure, I can meet you at the Student Union around 4 PM today!',
    time: '10:42 AM',
    unreadCount: 1,
    role: 'Buying',
    listingTitle: 'Sony WH-1000XM4',
    listingPrice: 'K1,800',
    listingImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    messages: [
      { id: 'm1', sender: 'me', text: 'Hi John! Are the Sony XM4 headphones still available?', timestamp: '10:30 AM' },
      { id: 'm2', sender: 'peer', text: 'Hey Alex! Yes they are. Interested in picking them up today?', timestamp: '10:35 AM' },
      { id: 'm3', sender: 'me', text: 'Definitely. Could we meet near the Student Union?', timestamp: '10:38 AM' },
      { id: 'm4', sender: 'peer', text: 'Sure, I can meet you at the Student Union around 4 PM today!', timestamp: '10:42 AM' }
    ]
  },
  {
    id: 'thread-2',
    peerName: 'Sarah Jenkins',
    peerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    lastMessage: 'Thanks! The pasta was amazing!',
    time: 'Yesterday',
    unreadCount: 0,
    role: 'Buying',
    listingTitle: 'Homemade Pasta Dinner',
    listingPrice: 'K45',
    listingImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
    messages: [
      { id: 'm10', sender: 'me', text: 'Hey Sarah, can I reserve 1 pasta bowl for 6:30 PM?', timestamp: 'Yesterday 5:00 PM' },
      { id: 'm11', sender: 'peer', text: 'Got it! I will have it ready in Hall 4 kitchen.', timestamp: 'Yesterday 5:15 PM' },
      { id: 'm12', sender: 'me', text: 'Thanks! The pasta was amazing!', timestamp: 'Yesterday 7:15 PM' }
    ]
  },
  {
    id: 'thread-3',
    peerName: 'Marcus Chen',
    peerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
    lastMessage: 'Are you still selling the Keychron K2 keyboard?',
    time: 'Oct 28',
    unreadCount: 2,
    role: 'Selling',
    listingTitle: 'Mechanical Keyboard - Keychron K2',
    listingPrice: 'K75',
    listingImage: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
    messages: [
      { id: 'm20', sender: 'peer', text: 'Hey Alex! I saw your Keychron K2 listing.', timestamp: 'Oct 28, 2:10 PM' },
      { id: 'm21', sender: 'peer', text: 'Are you still selling the Keychron K2 keyboard?', timestamp: 'Oct 28, 2:12 PM' }
    ]
  }
];

export const mockFAQs: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I report a scam or suspicious listing?',
    answer: 'Use the "Report this listing" button on the listing detail screen, or contact our Campus Marketplace Manager directly through the Support tab. Our moderation team reviews flagged listings within 2 hours.',
    category: 'Safety'
  },
  {
    id: 'faq-2',
    question: 'What are the recommended campus pickup locations?',
    answer: 'We recommend meeting in well-lit, high-traffic campus spots during daylight hours: Student Union lobby, Main Campus Library entrance, or designated Student Centers.',
    category: 'Safety'
  },
  {
    id: 'faq-3',
    question: 'How do I edit or delete my listing?',
    answer: 'Go to your Profile > My Listings, select any Active listing you posted, and tap "Edit" or "Mark as Sold". You can also remove draft listings anytime.',
    category: 'Selling'
  },
  {
    id: 'faq-4',
    question: 'Is there a fee for selling on CampusMarket?',
    answer: 'No! CampusMarket is 100% free for verified students. 100% of the item price stays between student buyers and sellers.',
    category: 'General'
  }
];

export const activityTrendsChartData = [
  { day: 'MON', totalListings: 760, transactions: 340 },
  { day: 'TUE', totalListings: 1220, transactions: 560 },
  { day: 'WED', totalListings: 1460, transactions: 440 },
  { day: 'THU', totalListings: 1280, transactions: 650 },
  { day: 'FRI', totalListings: 2040, transactions: 880 },
  { day: 'SAT', totalListings: 2240, transactions: 1080 },
  { day: 'SUN', totalListings: 2420, transactions: 1290 }
];
