import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// --- IN-MEMORY DATABASE WITH INITIAL RICH MOCK DATA ---
interface ServerUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'guest' | 'customer' | 'admin';
  department?: string;
  year?: string;
  verified: boolean;
  rating: number;
  reviewsCount: number;
  joinedDate: string;
  bio?: string;
  phone?: string; // sensitive
  privateAddress?: string; // sensitive
  isSuspended?: boolean;
  isBanned?: boolean;
}

interface ServerListing {
  id: string;
  title: string;
  price: number;
  priceUnit?: string;
  category: 'Product' | 'Service' | 'Food';
  condition?: 'New' | 'Like New' | 'Good' | 'Fair' | 'N/A';
  brand?: string;
  location: string;
  image: string;
  gallery: string[];
  description: string;
  seller: {
    id: string;
    name: string;
    avatar: string;
    verified: boolean;
    department: string;
    year: string;
    rating: number;
    reviewsCount: number;
    joinedDate: string;
    bio?: string;
    email?: string;
    phone?: string;
    privateAddress?: string;
  };
  postedAt: string;
  isAvailable: boolean;
  badgeText?: string;
  stockInfo?: string;
  viewsCount?: number;
  likesCount?: number;
}

interface ServerAuditLog {
  id: string;
  adminId: string;
  action: 'remove_listing' | 'suspend_user' | 'ban_user' | 'dismiss_report' | 'act_report';
  targetId: string;
  timestamp: string;
  reason?: string;
  details?: string;
}

interface ServerDeal {
  id: string;
  listingId: string;
  title: string;
  price: number;
  image: string;
  buyerId: string;
  sellerId: string;
  counterpartyName: string;
  role: 'buyer' | 'seller';
  date: string;
  status: 'Completed' | 'Reserved' | 'Active' | 'Sold';
  rating?: number;
}

interface ServerMessageThread {
  id: string;
  buyerId: string;
  sellerId: string;
  peerName: string;
  peerAvatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  role: 'Buying' | 'Selling';
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  messages: {
    id: string;
    sender: 'me' | 'peer' | string;
    text: string;
    timestamp: string;
  }[];
}

interface ServerCartItem {
  id: string;
  userId: string;
  listingId: string;
  title: string;
  price: number;
  image: string;
  sellerName: string;
  sellerId: string;
  addedAt: string;
}

interface ServerNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'order' | 'message' | 'system' | 'moderation';
  link?: string;
}

// Initial DB state
const db = {
  users: [
    {
      id: 'user-new',
      name: 'Emma Watson',
      email: 'emma.w@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      department: 'School of Arts',
      year: 'Sophomore',
      verified: true,
      rating: 5.0,
      reviewsCount: 3,
      joinedDate: 'Joined Jan 2026',
      bio: 'Art and Literature student.',
      phone: '+1 (555) 019-2831',
      privateAddress: 'Hall 2, Room 402, Main Campus',
      isSuspended: false,
      isBanned: false,
    },
    {
      id: 'user-alex',
      name: 'Alex Rivers',
      email: 'alex.rivers@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      department: 'Faculty of Engineering',
      year: 'Senior Student',
      verified: true,
      rating: 4.8,
      reviewsCount: 24,
      joinedDate: 'Joined Oct 2021',
      bio: 'Engineering student selling gently used electronics and textbooks.',
      phone: '+1 (555) 382-9921',
      privateAddress: 'Engineering Dorms B, Room 109',
      isSuspended: false,
      isBanned: false,
    },
    {
      id: 'seller-john',
      name: 'John Doe',
      email: 'john.doe@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      department: 'School of Economics',
      year: 'Junior Student',
      verified: true,
      rating: 4.8,
      reviewsCount: 24,
      joinedDate: 'Member since 2022',
      phone: '+1 (555) 837-1209',
      privateAddress: 'Economics Quad #4',
      isSuspended: false,
      isBanned: false,
    },
    {
      id: 'seller-sarah',
      name: 'Sarah Jenkins',
      email: 'sarah.j@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      department: 'Biology Department',
      year: 'Sophomore',
      verified: true,
      rating: 5.0,
      reviewsCount: 19,
      joinedDate: 'Member since 2023',
      phone: '+1 (555) 771-0023',
      privateAddress: 'Hall 4 Dorm Kitchen',
      isSuspended: false,
      isBanned: false,
    },
    {
      id: 'seller-marcus',
      name: 'Marcus Chen',
      email: 'marcus.c@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      department: 'Computer Science',
      year: 'Graduate Student',
      verified: true,
      rating: 4.9,
      reviewsCount: 38,
      joinedDate: 'Member since 2021',
      phone: '+1 (555) 991-8844',
      privateAddress: 'Graduate Housing A-101',
      isSuspended: false,
      isBanned: false,
    },
    {
      id: 'admin-1',
      name: 'Campus Marketplace Admin',
      email: 'admin@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80',
      role: 'admin',
      department: 'Campus IT & Safety',
      year: 'Staff',
      verified: true,
      rating: 5.0,
      reviewsCount: 100,
      joinedDate: 'Staff Member',
      phone: '+1 (800) 555-0000',
      privateAddress: 'Admin Building Room 300',
      isSuspended: false,
      isBanned: false,
    },
  ] as ServerUser[],

  listings: [
    {
      id: 'listing-1',
      title: 'Sony WH-1000XM4 Noise Cancelling Headphones',
      price: 180,
      category: 'Product',
      condition: 'Like New',
      brand: 'Sony',
      location: 'Main Campus Library',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80',
      ],
      description: "Selling my Sony XM4s as I upgraded. Excellent condition, no scratches or scuffs. Battery life is still incredible (lasts about 30 hours). Comes with the original case and USB-C charging cable.",
      seller: {
        id: 'seller-john',
        name: 'John Doe',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
        verified: true,
        department: 'School of Economics',
        year: 'Junior Student',
        rating: 4.8,
        reviewsCount: 24,
        joinedDate: 'Member since 2022',
        email: 'john.doe@campus.edu',
        phone: '+1 (555) 837-1209',
        privateAddress: 'Economics Quad #4',
      },
      postedAt: '2 days ago',
      isAvailable: true,
      badgeText: 'Available',
      viewsCount: 124,
      likesCount: 18,
    },
    {
      id: 'listing-2',
      title: 'Homemade Pasta Dinner Bowl',
      price: 12,
      category: 'Food',
      location: 'Hall 4 Dorm Kitchen',
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      ],
      description: 'Fresh homemade pasta tossed with rich tomato garlic sauce, cherry tomatoes, and basil. Prepared cleanly in Hall 4 dorm kitchen. Great student meal alternative!',
      seller: {
        id: 'seller-sarah',
        name: 'Sarah Jenkins',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
        verified: true,
        department: 'Biology Department',
        year: 'Sophomore',
        rating: 5.0,
        reviewsCount: 19,
        joinedDate: 'Member since 2023',
        email: 'sarah.j@campus.edu',
        phone: '+1 (555) 771-0023',
        privateAddress: 'Hall 4 Dorm Kitchen',
      },
      postedAt: 'Today',
      isAvailable: true,
      badgeText: 'Available',
      stockInfo: 'Available until 7PM • 4 left',
      viewsCount: 89,
      likesCount: 22,
    },
    {
      id: 'listing-3',
      title: 'Calculus 101 & Linear Algebra Tutoring',
      price: 25,
      priceUnit: '/hr',
      category: 'Service',
      location: 'Student Center or Zoom',
      image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
      ],
      description: 'Struggling with Calculus or Linear Algebra? I am a senior engineering student offering 1-on-1 tutoring sessions tailored to midterm and final exam prep.',
      seller: {
        id: 'user-alex',
        name: 'Alex Rivers',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        verified: true,
        department: 'Faculty of Engineering',
        year: 'Senior Student',
        rating: 4.8,
        reviewsCount: 24,
        joinedDate: 'Joined Oct 2021',
        email: 'alex.rivers@campus.edu',
        phone: '+1 (555) 382-9921',
        privateAddress: 'Engineering Dorms B, Room 109',
      },
      postedAt: '1 day ago',
      isAvailable: true,
      badgeText: 'Available',
      viewsCount: 210,
      likesCount: 45,
    },
    {
      id: 'listing-4',
      title: 'Keychron K2 Mechanical Wireless Keyboard',
      price: 75,
      category: 'Product',
      condition: 'Like New',
      brand: 'Keychron',
      location: 'Computer Science Bldg',
      image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
      ],
      description: 'Wireless mechanical keyboard with Gateron Brown tactile switches. Connects via Bluetooth to up to 3 devices or wired USB-C.',
      seller: {
        id: 'seller-marcus',
        name: 'Marcus Chen',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
        verified: true,
        department: 'Computer Science',
        year: 'Graduate Student',
        rating: 4.9,
        reviewsCount: 38,
        joinedDate: 'Member since 2021',
        email: 'marcus.c@campus.edu',
        phone: '+1 (555) 991-8844',
        privateAddress: 'Graduate Housing A-101',
      },
      postedAt: '3 days ago',
      isAvailable: true,
      badgeText: 'Available',
      viewsCount: 156,
      likesCount: 31,
    },
  ] as ServerListing[],

  savedItems: {
    'user-alex': ['listing-1', 'listing-2'],
    'user-new': ['listing-1'],
    'seller-john': ['listing-3'],
  } as Record<string, string[]>,

  cartItems: [
    {
      id: 'cart-1',
      userId: 'user-new',
      listingId: 'listing-1',
      title: 'Sony WH-1000XM4 Noise Cancelling Headphones',
      price: 180,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      sellerName: 'John Doe',
      sellerId: 'seller-john',
      addedAt: '10 mins ago',
    },
  ] as ServerCartItem[],

  deals: [
    {
      id: 'deal-1',
      listingId: 'listing-3',
      title: 'Calculus 101 Tutoring Session',
      price: 25,
      image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
      buyerId: 'user-new',
      sellerId: 'user-alex',
      counterpartyName: 'Emma Watson',
      role: 'seller',
      date: 'July 28, 2026',
      status: 'Completed',
      rating: 5.0,
    },
    {
      id: 'deal-2',
      listingId: 'listing-1',
      title: 'Sony WH-1000XM4 Headphones',
      price: 180,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      buyerId: 'user-alex',
      sellerId: 'seller-john',
      counterpartyName: 'John Doe',
      role: 'buyer',
      date: 'July 30, 2026',
      status: 'Reserved',
    },
  ] as ServerDeal[],

  messageThreads: [
    {
      id: 'thread-1',
      buyerId: 'user-alex',
      sellerId: 'seller-john',
      peerName: 'John Doe',
      peerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      lastMessage: 'Sure, I can meet you at the Student Union around 4 PM today!',
      time: '10:42 AM',
      unreadCount: 1,
      role: 'Buying',
      listingTitle: 'Sony WH-1000XM4',
      listingPrice: '$180',
      listingImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      messages: [
        { id: 'm1', sender: 'user-alex', text: 'Hi John! Are the Sony XM4 headphones still available?', timestamp: '10:30 AM' },
        { id: 'm2', sender: 'seller-john', text: 'Hey Alex! Yes they are. Interested in picking them up today?', timestamp: '10:35 AM' },
        { id: 'm3', sender: 'user-alex', text: 'Definitely. Could we meet near the Student Union?', timestamp: '10:38 AM' },
        { id: 'm4', sender: 'seller-john', text: 'Sure, I can meet you at the Student Union around 4 PM today!', timestamp: '10:42 AM' }
      ]
    },
    {
      id: 'thread-2',
      buyerId: 'user-alex',
      sellerId: 'seller-sarah',
      peerName: 'Sarah Jenkins',
      peerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      lastMessage: 'Thanks! The pasta was amazing!',
      time: 'Yesterday',
      unreadCount: 0,
      role: 'Buying',
      listingTitle: 'Homemade Pasta Dinner Bowl',
      listingPrice: '$12',
      listingImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      messages: [
        { id: 'm10', sender: 'user-alex', text: 'Hey Sarah, can I reserve 1 pasta bowl for 6:30 PM?', timestamp: 'Yesterday 5:00 PM' },
        { id: 'm11', sender: 'seller-sarah', text: 'Got it! I will have it ready in Hall 4 kitchen.', timestamp: 'Yesterday 5:15 PM' },
        { id: 'm12', sender: 'user-alex', text: 'Thanks! The pasta was amazing!', timestamp: 'Yesterday 7:15 PM' }
      ]
    },
  ] as ServerMessageThread[],

  notifications: [
    {
      id: 'notif-1',
      userId: 'user-alex',
      title: 'New Message from John Doe',
      message: 'Sure, I can meet you at the Student Union around 4 PM today!',
      time: '10:42 AM',
      read: false,
      type: 'message',
      link: '/messages/thread-1'
    },
    {
      id: 'notif-2',
      userId: 'user-alex',
      title: 'Listing Reserved',
      message: 'Your order for Sony WH-1000XM4 Headphones is confirmed as Reserved.',
      time: '2 hours ago',
      read: false,
      type: 'order',
      link: '/deals'
    },
    {
      id: 'notif-3',
      userId: 'user-new',
      title: 'Welcome to CampusMarket!',
      message: 'Explore student-to-student textbook, food, and tech deals across campus.',
      time: 'Yesterday',
      read: true,
      type: 'system',
      link: '/'
    },
  ] as ServerNotification[],

  auditLogs: [
    {
      id: 'audit-101',
      adminId: 'admin-1',
      action: 'remove_listing',
      targetId: 'listing-old-spam',
      timestamp: '2026-07-31T09:15:00Z',
      reason: 'Prohibited item reported by students',
      details: 'Removed listing titled "Unauthorized Parking Pass"'
    },
    {
      id: 'audit-102',
      adminId: 'admin-1',
      action: 'suspend_user',
      targetId: 'user-spammer-42',
      timestamp: '2026-07-31T10:00:00Z',
      reason: 'Repeated duplicate spam listings',
      details: 'Suspended user account for 7 days'
    }
  ] as ServerAuditLog[]
};

// --- HELPER: GET CURRENT USER & DERIVE SELLER STATE ---
function getSessionUser(req: Request) {
  const userId = req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '').trim();
  if (!userId || userId === 'guest') {
    return {
      id: 'guest',
      name: 'Guest Visitor',
      email: '',
      avatar: '',
      role: 'guest' as const,
      hasActiveListings: false,
      isSuspended: false,
      isBanned: false,
    };
  }

  const user = db.users.find((u) => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase());
  if (!user) {
    return {
      id: 'guest',
      name: 'Guest Visitor',
      email: '',
      avatar: '',
      role: 'guest' as const,
      hasActiveListings: false,
      isSuspended: false,
      isBanned: false,
    };
  }

  // RULE 3: Derived seller state computed server-side!
  // Seller is NOT a stored role; it is derived state = role === 'customer' AND hasActiveListings === true
  const hasActiveListings =
    user.role === 'customer' &&
    db.listings.some(
      (l) =>
        l.seller.id === user.id &&
        (l.isAvailable || l.badgeText === 'Available' || l.badgeText === 'Active' || l.badgeText === 'Reserved')
    );

  return {
    ...user,
    hasActiveListings,
  };
}

// --- EXPRESS APPLICATION SETUP ---
const app = express();
app.use(express.json());

// Attach session user to req
app.use((req: Request, res: Response, next: NextFunction) => {
  (req as any).session = getSessionUser(req);
  next();
});

// Middleware: Check if account is suspended/banned for mutating write actions
app.use((req: Request, res: Response, next: NextFunction) => {
  const session = (req as any).session;
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  // Allow login/logout/signup even if guest
  if (req.path.startsWith('/api/auth')) {
    return next();
  }

  if (isMutating && (session.isSuspended || session.isBanned)) {
    return res.status(403).json({
      error: 'Access denied: Your account has been suspended or banned from performing write actions.',
      isSuspended: session.isSuspended,
      isBanned: session.isBanned,
    });
  }

  next();
});

// --- ROUTE MIDDLEWARES FOR ENFORCEMENT ---
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const session = (req as any).session;
  if (session.role === 'guest') {
    return res.status(401).json({ error: 'Authentication required. Please log in or sign up.' });
  }
  next();
};

const requireCustomerOrSeller = (req: Request, res: Response, next: NextFunction) => {
  const session = (req as any).session;
  if (session.role === 'guest') {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  // RULE 5: Admins cannot silently act as customers
  if (session.role === 'admin') {
    return res.status(403).json({
      error: 'Admins cannot perform customer actions (buy, sell, cart, saved, messages). Please use a customer account or test mode.',
      role: 'admin',
    });
  }
  next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const session = (req as any).session;
  if (session.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required.', role: session.role });
  }
  next();
};

// --- AUTH / SESSION ENDPOINTS ---
app.get('/api/auth/me', (req: Request, res: Response) => {
  const session = (req as any).session;
  res.json({
    user: session,
    isAuthenticated: session.role !== 'guest',
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, userId } = req.body;
  const targetId = userId || email;

  const user = db.users.find(
    (u) => u.id === targetId || u.email.toLowerCase() === String(targetId).toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ error: 'User account not found' });
  }

  const hasActiveListings =
    user.role === 'customer' &&
    db.listings.some(
      (l) => l.seller.id === user.id && (l.isAvailable || l.badgeText === 'Available' || l.badgeText === 'Active' || l.badgeText === 'Reserved')
    );

  res.json({
    success: true,
    user: { ...user, hasActiveListings },
    token: user.id,
  });
});

app.post('/api/auth/signup', (req: Request, res: Response) => {
  const { name, email, department, year } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const newUser: ServerUser = {
    id: `user-${Date.now()}`,
    name,
    email,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
    role: 'customer',
    department: department || 'General Campus',
    year: year || 'Student',
    verified: true,
    rating: 5.0,
    reviewsCount: 1,
    joinedDate: `Joined ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    isSuspended: false,
    isBanned: false,
  };

  db.users.push(newUser);

  res.json({
    success: true,
    user: { ...newUser, hasActiveListings: false },
    token: newUser.id,
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  res.json({ success: true });
});

// --- LISTINGS API (with Rule 8: Sensitive field stripping) ---
function stripSensitiveListingData(listing: ServerListing, callerRole: string) {
  if (callerRole === 'guest') {
    // RULE 8: Guests get sensitive fields stripped entirely
    return {
      ...listing,
      seller: {
        id: listing.seller.id,
        name: listing.seller.name,
        avatar: listing.seller.avatar,
        verified: listing.seller.verified,
        department: listing.seller.department,
        year: listing.seller.year,
        rating: listing.seller.rating,
        reviewsCount: listing.seller.reviewsCount,
        joinedDate: listing.seller.joinedDate,
        bio: listing.seller.bio,
        // Omit email, phone, privateAddress
      },
    };
  }
  return listing;
}

app.get('/api/listings', (req: Request, res: Response) => {
  const session = (req as any).session;
  const { category, search, sellerId } = req.query;

  let filtered = [...db.listings];
  if (category && category !== 'All') {
    filtered = filtered.filter((l) => l.category === category);
  }
  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.seller.name.toLowerCase().includes(q)
    );
  }
  if (sellerId) {
    filtered = filtered.filter((l) => l.seller.id === sellerId);
  }

  // Check saved status for current user
  const userSaved = session.role !== 'guest' ? db.savedItems[session.id] || [] : [];

  const responseList = filtered.map((l) => {
    const stripped = stripSensitiveListingData(l, session.role);
    return {
      ...stripped,
      isSaved: userSaved.includes(l.id),
    };
  });

  res.json({ listings: responseList });
});

app.get('/api/listings/:id', (req: Request, res: Response) => {
  const session = (req as any).session;
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const userSaved = session.role !== 'guest' ? db.savedItems[session.id] || [] : [];
  const stripped = stripSensitiveListingData(listing, session.role);

  res.json({
    listing: {
      ...stripped,
      isSaved: userSaved.includes(listing.id),
    },
  });
});

// CREATE LISTING
app.post('/api/listings', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { title, price, priceUnit, category, condition, brand, location, image, gallery, description, stockInfo } = req.body;

  if (!title || !price || !category) {
    return res.status(400).json({ error: 'Title, price, and category are required.' });
  }

  const newListing: ServerListing = {
    id: `listing-${Date.now()}`,
    title,
    price: Number(price),
    priceUnit,
    category,
    condition: condition || 'Good',
    brand: brand || '',
    location: location || 'Main Campus',
    image: image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    gallery: gallery || [image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'],
    description: description || 'No description provided.',
    seller: {
      id: session.id,
      name: session.name,
      avatar: session.avatar,
      verified: session.verified || true,
      department: session.department || 'General Campus',
      year: session.year || 'Student',
      rating: session.rating || 5.0,
      reviewsCount: session.reviewsCount || 1,
      joinedDate: session.joinedDate || 'Member',
      email: session.email,
      phone: session.phone,
      privateAddress: session.privateAddress,
    },
    postedAt: 'Just now',
    isAvailable: true,
    badgeText: 'Available',
    stockInfo,
    viewsCount: 1,
    likesCount: 0,
  };

  db.listings.unshift(newListing);

  res.status(201).json({
    success: true,
    listing: newListing,
    hasActiveListings: true,
  });
});

// EDIT LISTING (Enforces Ownership check)
app.put('/api/listings/:id', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const listingIndex = db.listings.findIndex((l) => l.id === req.params.id);

  if (listingIndex === -1) {
    return res.status(404).json({ error: 'Listing not found.' });
  }

  const existing = db.listings[listingIndex];

  // RULE 1: Ownership Check
  if (existing.seller.id !== session.id) {
    return res.status(403).json({
      error: 'Ownership check failed: You can only edit your own listings.',
      sellerId: existing.seller.id,
      currentUser: session.id,
    });
  }

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id, // protect ID
    seller: existing.seller, // protect seller owner
  };

  db.listings[listingIndex] = updated;
  res.json({ success: true, listing: updated });
});

// DELETE / REMOVE LISTING (Ownership check OR Admin moderation with Audit Log)
app.delete('/api/listings/:id', (req: Request, res: Response) => {
  const session = (req as any).session;
  if (session.role === 'guest') {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const listingIndex = db.listings.findIndex((l) => l.id === req.params.id);
  if (listingIndex === -1) {
    return res.status(404).json({ error: 'Listing not found.' });
  }

  const existing = db.listings[listingIndex];

  // If Admin: moderation removal + audit log
  if (session.role === 'admin') {
    db.listings.splice(listingIndex, 1);

    const logEntry: ServerAuditLog = {
      id: `audit-${Date.now()}`,
      adminId: session.id,
      action: 'remove_listing',
      targetId: existing.id,
      timestamp: new Date().toISOString(),
      reason: req.body?.reason || 'Removed by Admin Moderation',
      details: `Removed listing: "${existing.title}" by seller ${existing.seller.name}`,
    };
    db.auditLogs.unshift(logEntry);

    return res.json({
      success: true,
      message: 'Listing removed by Admin Moderation and logged to Audit Trail.',
      auditLogId: logEntry.id,
    });
  }

  // If Customer/Seller: RULE 1 Ownership Check
  if (existing.seller.id !== session.id) {
    return res.status(403).json({
      error: 'Ownership check failed: You can only delete your own listings.',
      sellerId: existing.seller.id,
      currentUser: session.id,
    });
  }

  db.listings.splice(listingIndex, 1);
  res.json({ success: true, message: 'Listing deleted successfully.' });
});

// GET MY LISTINGS
app.get('/api/my-listings', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const myListings = db.listings.filter((l) => l.seller.id === session.id);
  res.json({ listings: myListings });
});

// --- SAVED / WISHLIST API ---
app.get('/api/saved', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const savedIds = db.savedItems[session.id] || [];
  const savedListings = db.listings
    .filter((l) => savedIds.includes(l.id))
    .map((l) => ({ ...l, isSaved: true }));

  res.json({ saved: savedListings });
});

app.post('/api/saved/:listingId', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { listingId } = req.params;

  if (!db.savedItems[session.id]) {
    db.savedItems[session.id] = [];
  }

  const list = db.savedItems[session.id];
  const idx = list.indexOf(listingId);

  if (idx > -1) {
    list.splice(idx, 1);
    res.json({ success: true, isSaved: false, count: list.length });
  } else {
    list.push(listingId);
    res.json({ success: true, isSaved: true, count: list.length });
  }
});

// --- CART API ---
app.get('/api/cart', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const userCart = db.cartItems.filter((item) => item.userId === session.id);
  res.json({ cart: userCart });
});

app.post('/api/cart', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { listingId, title, price, image, sellerName, sellerId } = req.body;

  const newItem: ServerCartItem = {
    id: `cart-${Date.now()}`,
    userId: session.id,
    listingId,
    title,
    price: Number(price),
    image,
    sellerName,
    sellerId,
    addedAt: 'Just now',
  };

  db.cartItems.push(newItem);
  res.status(201).json({ success: true, item: newItem });
});

app.delete('/api/cart/:id', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const idx = db.cartItems.findIndex((c) => c.id === req.params.id && c.userId === session.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Cart item not found or ownership failed.' });
  }
  db.cartItems.splice(idx, 1);
  res.json({ success: true });
});

// --- DEALS HISTORY API (Ownership checked) ---
app.get('/api/deals', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  // User can only see deals where they are buyerId or sellerId
  const myDeals = db.deals.filter(
    (d) => d.buyerId === session.id || d.sellerId === session.id
  );
  res.json({ deals: myDeals });
});

// --- MESSAGES API (Ownership checked + Sensitive fields stripped for strangers) ---
app.get('/api/messages', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  // RULE 1: Can only view conversations where userId is buyerId or sellerId
  const myThreads = db.messageThreads.filter(
    (t) => t.buyerId === session.id || t.sellerId === session.id
  );

  res.json({ threads: myThreads });
});

app.get('/api/messages/:id', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const thread = db.messageThreads.find((t) => t.id === req.params.id);
  if (!thread) {
    return res.status(404).json({ error: 'Message thread not found.' });
  }

  // RULE 1: Enforce ownership check!
  if (thread.buyerId !== session.id && thread.sellerId !== session.id) {
    return res.status(403).json({
      error: 'Ownership check failed: You can only read your own private conversations.',
    });
  }

  res.json({ thread });
});

app.post('/api/messages/:id/send', requireCustomerOrSeller, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { text } = req.body;
  const thread = db.messageThreads.find((t) => t.id === req.params.id);

  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  if (thread.buyerId !== session.id && thread.sellerId !== session.id) {
    return res.status(403).json({ error: 'Ownership check failed: You are not a participant in this conversation.' });
  }

  const newMsg = {
    id: `m-${Date.now()}`,
    sender: session.id,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  thread.messages.push(newMsg);
  thread.lastMessage = text;
  thread.time = 'Just now';

  res.json({ success: true, message: newMsg });
});

// --- NOTIFICATIONS API ---
app.get('/api/notifications', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session;
  const userNotifs = db.notifications.filter((n) => n.userId === session.id);
  res.json({ notifications: userNotifs });
});

app.post('/api/notifications/:id/read', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session;
  const notif = db.notifications.find((n) => n.id === req.params.id && n.userId === session.id);
  if (notif) {
    notif.read = true;
  }
  res.json({ success: true });
});

// --- USERS / PUBLIC PROFILES API ---
app.get('/api/users/:id', (req: Request, res: Response) => {
  const session = (req as any).session;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (session.role === 'guest') {
    // Strip sensitive fields
    const { email, phone, privateAddress, ...publicProfile } = user;
    return res.json({ user: publicProfile });
  }

  res.json({ user });
});

// --- ADMIN MODERATION & CONSOLE API ---
app.get('/api/admin/stats', requireAdmin, (req: Request, res: Response) => {
  res.json({
    totalUsers: db.users.length,
    activeListings: db.listings.length,
    completedDeals: db.deals.length,
    pendingReports: 2,
    users: db.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      verified: u.verified,
      department: u.department,
      year: u.year,
      isSuspended: !!u.isSuspended,
      isBanned: !!u.isBanned,
    })),
    recentAuditLogs: db.auditLogs.slice(0, 10),
  });
});

app.get('/api/admin/audit-logs', requireAdmin, (req: Request, res: Response) => {
  res.json({ logs: db.auditLogs });
});

// ADMIN: SUSPEND USER (with immediate write action lockout + audit log)
app.post('/api/admin/suspend-user', requireAdmin, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { userId, reason } = req.body;

  const target = db.users.find((u) => u.id === userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }

  target.isSuspended = true;

  const logEntry: ServerAuditLog = {
    id: `audit-${Date.now()}`,
    adminId: session.id,
    action: 'suspend_user',
    targetId: target.id,
    timestamp: new Date().toISOString(),
    reason: reason || 'Violation of campus safety rules',
    details: `Suspended user "${target.name}" (${target.email})`,
  };
  db.auditLogs.unshift(logEntry);

  res.json({
    success: true,
    message: `User ${target.name} has been suspended immediately.`,
    user: target,
    auditLog: logEntry,
  });
});

// ADMIN: BAN USER (with immediate write action lockout + audit log)
app.post('/api/admin/ban-user', requireAdmin, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { userId, reason } = req.body;

  const target = db.users.find((u) => u.id === userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }

  target.isBanned = true;
  target.isSuspended = true;

  const logEntry: ServerAuditLog = {
    id: `audit-${Date.now()}`,
    adminId: session.id,
    action: 'ban_user',
    targetId: target.id,
    timestamp: new Date().toISOString(),
    reason: reason || 'Severe violation or scam reported',
    details: `Banned user "${target.name}" (${target.email})`,
  };
  db.auditLogs.unshift(logEntry);

  res.json({
    success: true,
    message: `User ${target.name} has been permanently banned.`,
    user: target,
    auditLog: logEntry,
  });
});

// --- VITE MIDDLEWARE SETUP ---
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  CampusMarket server running at:`);
    console.log(`  > Local:   http://localhost:${PORT}/`);
    console.log(`  > Network: http://127.0.0.1:${PORT}/\n`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Error] Port ${PORT} is already in use. Please close the existing process or use PORT=${PORT + 1} npm run dev\n`);
    } else {
      console.error('[Error] Server failure:', err);
    }
  });
}

startServer();
