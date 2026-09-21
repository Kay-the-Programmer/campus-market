import React, { useMemo, useRef, useState } from 'react';
import {
  X, ShoppingBag, Briefcase, Utensils, Plus, Minus, CheckCircle2, Check,
  MapPin, AlertCircle, ImagePlus, Loader2, Eye, Trash2, ChevronLeft,
  Camera, Tag, DollarSign, FileText, Layers, Clock, Wheat, ImageOff,
  CalendarClock, DoorOpen,
} from 'lucide-react';
import { AuthSession, CampusZone, CAMPUS_ZONES, Listing, ListingCategory, ListingCondition } from '../types';

/**
 * What the condition dropdown can actually be set to.
 *
 * <p>'N/A' is a real {@link ListingCondition} but belongs to services, which
 * have no condition to report. It is excluded here so the form's state cannot
 * hold a value the select never offers.
 */
type SellableCondition = Exclude<ListingCondition, 'N/A'>;
import { api } from '../services/api';
import { DetailScreen } from './DetailScreen';
import { Modal } from './shared/Modal';
import { formatPrice } from '../utils/currency';
import { uploadImageFile } from '../utils/images';

interface SellScreenProps {
  onBack: () => void;
  /** Create-mode payload; App forwards it to POST /api/listings. */
  onPublishListing: (payload: Record<string, unknown>) => void;
  /** Edit-mode payload; App forwards it to PUT /api/listings/:id. */
  onSaveEdit?: (id: string, payload: Record<string, unknown>) => void;
  /** Present -> edit mode. Absent -> create mode. */
  editingListing?: Listing | null;
  onListingDeleted?: () => void;
  currentUser?: AuthSession;
}

interface CategoryOption {
  id: string;
  name: string;
}

const CONDITION_VALUES: Record<string, string> = {
  'New': 'NEW',
  'Like New': 'LIKE_NEW',
  'Good': 'GOOD',
  'Fair': 'FAIR',
};
const CONDITION_LABEL_BY_API: Record<string, string> = {
  NEW: 'New', LIKE_NEW: 'Like New', GOOD: 'Good', FAIR: 'Fair',
};

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Halal', 'Gluten-free', 'Nut-free', 'Contains dairy'];

const AVAILABILITY_CHIPS = [
  'Anytime', 'Monday - Friday', 'Weekends Only',
  'Sunday Only', 'Saturday Only', 'Weekend Afternoon',
];

const FIELD_LABEL: Record<string, string> = {
  title: 'Title', price: 'Price', photos: 'Photos', location: 'Location',
  campusZone: 'Campus zone',
  rateType: 'Rate type', quantity: 'Servings', pickupWindow: 'Pickup window',
};

// Every photo is downscaled and re-encoded client-side before it goes
// anywhere - a raw phone photo can be 8-12MB, which would bloat the upload and
// the stored file for no visual benefit at listing-card size. The rendering
// itself lives in utils/images.ts, shared with the promo editor, and now
// produces a thumbnail alongside the full image in the same pass. What is
// stored is the URL that comes back, not the image.
const MAX_PHOTOS = 5;
const MAX_SOURCE_FILE_MB = 15;

/** Splits a pre-existing free-text availability string into recognised chips
 *  plus whatever doesn't match one, so editing an older listing never silently
 *  drops information the seller already wrote. */
function splitAvailability(raw?: string): { chips: string[]; notes: string } {
  if (!raw) return { chips: [], notes: '' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const chips = parts.filter((p) => AVAILABILITY_CHIPS.includes(p));
  const notes = parts.filter((p) => !AVAILABILITY_CHIPS.includes(p)).join(', ');
  return { chips, notes };
}

/** Accent tokens per offering type, reused by the type picker, the section
 *  nav, and the live preview so the whole page visibly "belongs" to whatever
 *  the seller is listing. */
const ACCENT: Record<ListingCategory, { text: string; bg: string; border: string; ring: string; solidBg: string }> = {
  Product: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-500', solidBg: 'bg-blue-600' },
  Service: { text: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', ring: 'ring-violet-500', solidBg: 'bg-violet-600' },
  Food: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-500', solidBg: 'bg-emerald-600' },
};

export const SellScreen: React.FC<SellScreenProps> = ({
  onBack,
  onPublishListing,
  onSaveEdit,
  editingListing,
  onListingDeleted,
  currentUser,
}) => {
  const isEditMode = !!editingListing;
  const initialAvailability = useMemo(() => splitAvailability(editingListing?.availability), [editingListing]);

  const [offeringType, setOfferingType] = useState<ListingCategory | null>(editingListing?.category ?? null);
  const [title, setTitle] = useState(editingListing?.title ?? '');
  const [categoryId, setCategoryId] = useState(editingListing?.categoryId ?? '');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [price, setPrice] = useState(editingListing ? String(editingListing.price) : '');
  const [description, setDescription] = useState(editingListing?.description ?? '');
  const [location, setLocation] = useState(editingListing?.location ?? '');
  // Pre-filled from the seller's own zone: people overwhelmingly hand over
  // near where they live, so that guess is right far more often than blank.
  const [campusZone, setCampusZone] = useState<CampusZone | ''>(
    editingListing?.campusZone ?? currentUser?.campusZone ?? '',
  );
  const [photos, setPhotos] = useState<string[]>(editingListing?.gallery ?? []);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Product
  const [condition, setCondition] = useState<SellableCondition>(
    editingListing?.condition && editingListing.condition !== 'N/A' ? editingListing.condition : 'Like New',
  );
  const [brand, setBrand] = useState(editingListing?.brand ?? '');
  // Service
  const [rateType, setRateType] = useState(editingListing?.rateType ?? 'HOURLY');
  /* Existing services predate this field and were all published as bookable,
     so that stays the default rather than silently switching them. */
  const [serviceMode, setServiceMode] = useState<'BOOKING' | 'WALK_IN'>(
    (editingListing?.serviceMode as 'BOOKING' | 'WALK_IN') ?? 'BOOKING');
  const [availabilityChips, setAvailabilityChips] = useState<string[]>(initialAvailability.chips);
  const [availabilityNotes, setAvailabilityNotes] = useState(initialAvailability.notes);
  // Food
  const [quantity, setQuantity] = useState(editingListing?.quantity ? String(editingListing.quantity) : '1');
  const [pickupWindow, setPickupWindow] = useState(editingListing?.pickupWindow ?? '');
  const [dietaryTags, setDietaryTags] = useState<string[]>(editingListing?.dietaryTags ?? []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Section refs power the "jump to" nav below - a long single-page form is
  // otherwise hard to orient in, especially once it grows to 4-5 cards deep.
  const photosRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);

  const isSoldListing = editingListing?.badgeText === 'Sold';

  React.useEffect(() => {
    api.categories.getAll().then((res) => {
      if (res.error) {
        setCategoriesError(res.error);
        setCategoriesLoading(false);
        return;
      }
      const list = (res.categories as CategoryOption[]) || [];
      setCategories(list);
      if (list.length && !categoryId) setCategoryId(list[0].id);
      setCategoriesLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericPrice = parseFloat(price.replace(/[^0-9.]/g, ''));
  const availability = [...availabilityChips, availabilityNotes.trim()].filter(Boolean).join(', ');

  const isDirty =
    title !== (editingListing?.title ?? '') ||
    description !== (editingListing?.description ?? '') ||
    price !== (editingListing ? String(editingListing.price) : '') ||
    location !== (editingListing?.location ?? '') ||
    campusZone !== (editingListing?.campusZone ?? currentUser?.campusZone ?? '') ||
    photos.length !== (editingListing?.gallery ?? []).length ||
    (!isEditMode && offeringType !== null);

  /** Drives both the disabled Publish button and the inline "missing" note. */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!offeringType) return next; // nothing else can be wrong before a type exists
    if (!title.trim()) next.title = 'Give your listing a title.';
    if (!price.trim() || Number.isNaN(numericPrice)) next.price = 'Enter a price.';
    else if (numericPrice < 0) next.price = 'Price cannot be negative.';
    if (photos.length === 0) next.photos = 'Add at least one photo before publishing.';
    if (!campusZone) next.campusZone = 'Choose which part of campus.';
    if (!location.trim()) next.location = 'Add a pickup or meetup location.';

    if (offeringType === 'Food') {
      const qty = parseInt(quantity, 10);
      if (!qty || qty < 1) next.quantity = 'Enter how many servings are available.';
      if (!pickupWindow.trim()) next.pickupWindow = 'Enter a pickup window.';
    }
    return next;
  };

  const liveErrors = validate();
  const firstMissingLabel = Object.keys(liveErrors).map((k) => FIELD_LABEL[k] || k)[0];
  const canPublish = offeringType !== null && Object.keys(liveErrors).length === 0;

  // ── Section completion, used by the jump-to nav and the progress bar ──
  // Deliberately looser than `validate()`: this is "have you touched this
  // section" wayfinding, not a hard gate, so it can't block or nag early.
  const photosDone = photos.length > 0;
  const detailsDone = Boolean(
    title.trim() && price.trim() && !Number.isNaN(numericPrice) &&
    (offeringType !== 'Food' || (parseInt(quantity, 10) > 0 && pickupWindow.trim())),
  );
  const locationDone = Boolean(location.trim() && campusZone);
  const sectionsDone = [photosDone, detailsDone, locationDone].filter(Boolean).length;
  const progressPct = Math.round((sectionsDone / 3) * 100);

  // Nullable element type: React 19's useRef(null) yields
  // RefObject<HTMLDivElement | null>, which is also what the ?. below assumes.
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const buildPayload = (status: 'ACTIVE' | 'DRAFT') => ({
    type: offeringType!.toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    price: Number.isNaN(numericPrice) ? 0 : numericPrice,
    priceUnit: offeringType === 'Service' && rateType === 'HOURLY' ? '/hr' : undefined,
    categoryId: categoryId || undefined,
    location: location.trim(),
    campusZone: campusZone || undefined,
    images: photos,
    status,
    condition: offeringType === 'Product' ? CONDITION_VALUES[condition] : undefined,
    brand: offeringType === 'Product' ? brand.trim() || undefined : undefined,
    availability: offeringType === 'Service' ? availability || undefined : undefined,
    rateType: offeringType === 'Service' ? rateType : undefined,
    serviceMode: offeringType === 'Service' ? serviceMode : undefined,
    quantity: offeringType === 'Food' ? parseInt(quantity, 10) || undefined : undefined,
    pickupWindow: offeringType === 'Food' ? pickupWindow.trim() || undefined : undefined,
    dietaryTags: offeringType === 'Food' && dietaryTags.length ? dietaryTags : undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (!offeringType || Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    if (isEditMode && editingListing && onSaveEdit) {
      onSaveEdit(editingListing.id, buildPayload('ACTIVE'));
    } else {
      onPublishListing(buildPayload('ACTIVE'));
    }
    setIsSubmitting(false);
  };

  const handleSaveDraft = () => {
    if (!offeringType) return;
    if (!title.trim()) {
      setErrors({ title: 'Give your draft a title so you can find it later.' });
      return;
    }
    setErrors({});
    onPublishListing(buildPayload('DRAFT'));
  };

  const handleClose = () => {
    if (isDirty) setDiscardOpen(true);
    else onBack();
  };

  const handleDelete = async () => {
    if (!editingListing) return;
    setDeleting(true);
    const res = await api.listings.delete(editingListing.id, true);
    setDeleting(false);
    if (res.success) {
      setDeleteOpen(false);
      if (onListingDeleted) onListingDeleted(); else onBack();
    } else {
      setDeleteError(res.error || 'Could not delete this listing.');
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setPhotoError(null);
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const toProcess = files.slice(0, remainingSlots);
    if (files.length > toProcess.length) {
      setPhotoError(`Only the first ${toProcess.length} photo(s) were added — the limit is ${MAX_PHOTOS}.`);
    }

    setProcessingPhotos(true);
    const next: string[] = [];
    for (const file of toProcess) {
      if (!file.type.startsWith('image/')) {
        setPhotoError(`"${file.name}" isn't an image and was skipped.`);
        continue;
      }
      if (file.size > MAX_SOURCE_FILE_MB * 1024 * 1024) {
        setPhotoError(`"${file.name}" is larger than ${MAX_SOURCE_FILE_MB}MB and was skipped.`);
        continue;
      }
      try {
        next.push(await uploadImageFile(file, { filename: 'listing.webp' }));
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : `Could not process "${file.name}".`);
      }
    }
    setProcessingPhotos(false);
    if (next.length) setPhotos((prev) => [...prev, ...next]);
  };

  const removePhoto = (index: number) => setPhotos(photos.filter((_, i) => i !== index));

  const toggleDietaryTag = (tag: string) =>
    setDietaryTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const toggleAvailabilityChip = (chip: string) =>
    setAvailabilityChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));

  const OFFERINGS: { type: ListingCategory; icon: React.ReactNode; label: string; desc: string }[] = [
    { type: 'Product', icon: <ShoppingBag className="w-6 h-6" />, label: 'Product', desc: 'Sell an item' },
    { type: 'Service', icon: <Briefcase className="w-6 h-6" />, label: 'Service', desc: 'Offer your skills' },
    { type: 'Food', icon: <Utensils className="w-6 h-6" />, label: 'Food', desc: 'Share a meal' },
  ];

  const FieldError: React.FC<{ name: string }> = ({ name }) =>
    errors[name] ? (
      <p className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors[name]}
      </p>
    ) : null;

  const previewListing: Listing | null = useMemo(() => {
    if (!previewOpen || !offeringType) return null;
    return {
      id: editingListing?.id ?? 'preview',
      title: title.trim() || 'Untitled listing',
      price: Number.isNaN(numericPrice) ? 0 : numericPrice,
      priceUnit: offeringType === 'Service' && rateType === 'HOURLY' ? '/hr' : undefined,
      category: offeringType,
      condition: offeringType === 'Product' ? (condition as any) : 'N/A',
      brand: offeringType === 'Product' ? brand : undefined,
      location: location || 'Not set yet',
      image: photos[0] || '',
      gallery: photos,
      description: description || 'No description yet.',
      seller: {
        id: currentUser?.id || 'me',
        name: currentUser?.name || 'You',
        avatar: currentUser?.avatar || '',
        verified: false,
        department: currentUser?.department || '',
        year: currentUser?.year || '',
        rating: 0,
        reviewsCount: 0,
        joinedDate: 'Joined recently',
      },
      postedAt: 'Just now',
      isAvailable: true,
      isSaved: false,
      badgeText: 'Available',
      pickupWindow: offeringType === 'Food' ? pickupWindow : undefined,
      availability: offeringType === 'Service' ? availability : undefined,
      quantity: offeringType === 'Food' ? parseInt(quantity, 10) || undefined : undefined,
      dietaryTags: offeringType === 'Food' ? dietaryTags : undefined,
      categoryName: categories.find((c) => c.id === categoryId)?.name,
    };
  }, [previewOpen, offeringType, title, numericPrice, rateType, condition, brand, location, photos,
    description, currentUser, pickupWindow, availability, quantity, dietaryTags, categoryId, categories, editingListing]);

  // Lightweight always-on summary for the desktop sidebar - separate from
  // `previewListing` above so the glance-card doesn't wait on the full
  // preview modal being open.
  const accent = offeringType ? ACCENT[offeringType] : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 lg:pb-24">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="group flex items-center gap-2 px-2 py-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              {isEditMode ? (
                <ChevronLeft className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
              ) : (
                <X className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
              )}
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                {isEditMode ? 'Edit Listing' : 'New Listing'}
              </h1>
            </button>
          </div>
          {isEditMode && (
            <button
              onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
              className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
        </div>

        {/* ── Section nav + progress. Only worth showing once there are
             sections to jump between - i.e. after a type is picked. ── */}
        {offeringType && (
          <div className="border-t border-slate-100">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { key: 'photos', label: 'Photos', done: photosDone, ref: photosRef },
                { key: 'details', label: 'Details', done: detailsDone, ref: detailsRef },
                { key: 'location', label: 'Location', done: locationDone, ref: locationRef },
              ].map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => scrollToSection(s.ref)}
                  className="shrink-0 flex items-center gap-1.5 pr-4 group"
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors ${s.done ? `${accent?.solidBg} text-white` : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300'
                      }`}
                  >
                    {s.done ? <Check className="w-2.5 h-2.5" /> : i + 1}
                  </span>
                  <span className={`text-xs font-semibold whitespace-nowrap transition-colors ${s.done ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-600'
                    }`}>
                    {s.label}
                  </span>
                </button>
              ))}
              <span className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400">
                {sectionsDone}/3 done
              </span>
            </div>
            <div className="h-0.5 w-full bg-slate-100">
              <div
                className={`h-full ${accent?.solidBg} transition-all duration-300 ease-out`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 lg:flex lg:items-start lg:gap-8">
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8 lg:flex-1 lg:min-w-0 lg:max-w-2xl">

          {/* ── Type selector ── */}
          {isEditMode ? (
            <div className="flex items-center gap-3 bg-white rounded-2xl p-4 ring-1 ring-slate-900/5 shadow-sm">
              <span className="text-sm font-medium text-slate-500">Listing type</span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${accent?.bg} ${accent?.text} border ${accent?.border}`}>
                {offeringType === 'Product' && <ShoppingBag className="w-3.5 h-3.5" />}
                {offeringType === 'Service' && <Briefcase className="w-3.5 h-3.5" />}
                {offeringType === 'Food' && <Utensils className="w-3.5 h-3.5" />}
                {offeringType}
              </span>
              <span className="text-xs text-slate-400 ml-auto">Can't be changed after publishing</span>
            </div>
          ) : (
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-1">What are you offering?</h2>
              <p className="text-sm text-slate-500 mb-4">Pick what you are actually offering to the community.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4" data-onboarding="sell-type">
                {OFFERINGS.map(({ type, icon, label, desc }) => {
                  const selected = offeringType === type;
                  const a = ACCENT[type];
                  return (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setOfferingType(type)}
                      className={`relative p-5 sm:p-6 rounded-2xl border-2 flex flex-col items-center text-center gap-3 transition-all duration-200 ${selected
                        ? `${a.border} ${a.bg} shadow-md ring-1 ${a.ring}`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                    >
                      {selected && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle2 className={`w-5 h-5 ${a.text}`} />
                        </div>
                      )}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200 ${selected ? `${a.bg} ${a.text}` : 'bg-slate-100 text-slate-500'
                        }`}>
                        {icon}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{label}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Nothing else is fillable until a type is chosen */}
          {offeringType && (
            <div className="space-y-6 sm:space-y-8 animate-fade-in">

              {/* ── Photos ── */}
              <section ref={photosRef} data-onboarding="sell-photos" className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 scroll-mt-32">
                <div className="flex items-center gap-2 mb-4">
                  <Camera className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Photos</h2>
                  <span className="text-xs text-slate-400 ml-auto">{photos.length}/{MAX_PHOTOS}</span>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {photos.map((url, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 group">
                      <img src={url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                      {index === 0 && (
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm">
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label="Remove photo"
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={processingPhotos}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 disabled:opacity-50 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition-all duration-200"
                    >
                      {processingPhotos ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="w-7 h-7 mb-1" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Add</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  At least 1 photo required. The first photo is your cover image.
                </p>
                {photoError && (
                  <p className="mt-2 text-xs text-amber-700 font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {photoError}
                  </p>
                )}
                <FieldError name="photos" />
              </section>

              {/* ── Basic Info + type-specific fields share one "Details" stop
                   on the section nav, since they're really one decision. ── */}
              <div ref={detailsRef} className="space-y-6 sm:space-y-8 scroll-mt-32">
                <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-5">


                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {
                        offeringType === 'Food'
                          ? "Menu Name"
                          : offeringType === 'Service'
                            ? 'Service Name'
                            : "Product Name"
                      }
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={80}
                      placeholder={
                        offeringType === 'Food'
                          ? "e.g. Chicken & Chips, Sharwama"
                          : offeringType === 'Service'
                            ? 'e.g. Tutoring'
                            : "e.g. JBL Headphones"
                      }
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <div className="flex justify-between mt-1.5">
                      <FieldError name="title" />
                      <span className="text-[10px] text-slate-400 font-medium ml-auto">{title.length}/80</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      placeholder={
                        offeringType === 'Food'
                          ? "Describe what's included, portion size, any allergens…"
                          : offeringType === 'Service'
                            ? 'Describe what you offer and your experience…'
                            : "Describe the item's features, flaws, or why you're selling it…"
                      }
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Price{offeringType === 'Service' ? '' : ' (K)'}
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            disabled={isSoldListing}
                            placeholder="0.00"
                            className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
                          />
                        </div>
                        {offeringType === 'Service' && (
                          <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
                            {(['HOURLY', 'FIXED'] as const).map((rt) => (
                              <button
                                key={rt}
                                type="button"
                                onClick={() => setRateType(rt)}
                                className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${rateType === rt ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                  }`}
                              >
                                {rt === 'HOURLY' ? 'Per Hour' : 'Fixed'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {isSoldListing && (
                        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                          Price is locked once a listing is sold, so buyers who already messaged aren't misled.
                        </p>
                      )}
                      <FieldError name="price" />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
                      <div className="relative">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          disabled={categoriesLoading || categories.length === 0}
                          className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60 appearance-none"
                        >
                          {categoriesLoading && <option value="">Loading categories…</option>}
                          {!categoriesLoading && categories.length === 0 && <option value="">No categories available</option>}
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      {categoriesError && (
                        <p className="mt-1.5 text-xs text-red-600 font-semibold">Couldn't load categories: {categoriesError}</p>
                      )}
                    </div>
                  </div>
                </section>

                {offeringType === 'Product' && (
                  <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Product Details</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Condition</label>
                        <select
                          value={condition}
                          onChange={(e) => setCondition(e.target.value as SellableCondition)}
                          disabled={isSoldListing}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60 appearance-none"
                        >
                          <option value="New">New (Unopened)</option>
                          <option value="Like New">Like New (Perfect condition)</option>
                          <option value="Good">Good (Normal signs of use)</option>
                          <option value="Fair">Fair (Working with cosmetic wear)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Brand <span className="text-slate-400 font-normal">(Optional)</span></label>
                        <input
                          type="text"
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          placeholder="e.g. Apple, Nike, IKEA"
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {offeringType === 'Service' && (
                  <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        How it works
                      </h2>
                    </div>

                    {/* This choice decides what buyers see: a booking form, or
                        a "message and drop in" prompt. Asked first because the
                        availability below means different things under each -
                        a diary to book against, versus opening hours. */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        How do people get this service?
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {([
                          {
                            value: 'BOOKING',
                            icon: <CalendarClock className="w-4 h-4" />,
                            label: 'Book a time',
                            desc: 'They request a slot and you confirm it. Tutoring, repairs, haircuts.',
                          },
                          {
                            value: 'WALK_IN',
                            icon: <DoorOpen className="w-4 h-4" />,
                            label: 'Just come by',
                            desc: 'No booking needed - they message you and drop in. Printing, binding.',
                          },
                        ] as const).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setServiceMode(opt.value)}
                            aria-pressed={serviceMode === opt.value}
                            className={`p-3.5 rounded-xl border text-left transition-all duration-150 ${serviceMode === opt.value
                              ? 'bg-violet-50 border-violet-500 ring-1 ring-violet-500'
                              : 'bg-white border-slate-200 hover:border-violet-300'
                              }`}
                          >
                            <span
                              className={`flex items-center gap-2 font-bold text-sm ${serviceMode === opt.value ? 'text-violet-700' : 'text-slate-700'
                                }`}
                            >
                              {opt.icon}
                              {opt.label}
                            </span>
                            <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                              {opt.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        {serviceMode === 'WALK_IN'
                          ? 'When can people find you?'
                          : 'When are you generally free?'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABILITY_CHIPS.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => toggleAvailabilityChip(chip)}
                            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${availabilityChips.includes(chip)
                              ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700'
                              }`}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Additional notes <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={availabilityNotes}
                        onChange={(e) => setAvailabilityNotes(e.target.value)}
                        placeholder="e.g. by appointment on exam weeks"
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Buyers can still request other times — you can negotiate in chat.
                      </p>
                    </div>
                  </section>
                )}

                {offeringType === 'Food' && (
                  <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Wheat className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Food Details</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Servings available</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
                            className="w-11 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-20 px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => String((parseInt(q, 10) || 0) + 1))}
                            className="w-11 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <FieldError name="quantity" />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pickup window</label>
                        <input
                          type="text"
                          value={pickupWindow}
                          onChange={(e) => setPickupWindow(e.target.value)}
                          placeholder="e.g. Today, 5:00 PM – 7:00 PM"
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                        <FieldError name="pickupWindow" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Dietary tags <span className="text-slate-400 font-normal">(optional)</span></label>
                      <div className="flex flex-wrap gap-2">
                        {DIETARY_OPTIONS.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleDietaryTag(tag)}
                            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${dietaryTags.includes(tag)
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                              }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {/* ── Location ── */}
              <section ref={locationRef} className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-4 scroll-mt-32">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Location</h2>
                </div>
                {/* Zone first: it is what buyers filter on, so it has to be a
                    fixed choice rather than free text everyone spells
                    differently. The text field below it stays for the exact
                    spot, which a three-way zone is far too vague to convey. */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Which part of campus?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CAMPUS_ZONES.map((zone) => {
                      const selected = campusZone === zone.value;
                      return (
                        <button
                          key={zone.value}
                          type="button"
                          onClick={() => setCampusZone(zone.value)}
                          aria-pressed={selected}
                          className={`rounded-xl border p-3 text-left transition-all ${selected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                          <span className={`block text-sm font-bold leading-tight ${selected ? 'text-blue-700' : 'text-slate-900'}`}>
                            {zone.label}
                          </span>
                          <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">
                            {zone.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FieldError name="campusZone" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Exact meetup spot</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Student Hostels, Student Center"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    A common place on campus is enough — avoid your exact room or address.
                  </p>
                  <FieldError name="location" />
                </div>
              </section>
            </div>
          )}
        </form>
      </main>

      {/* ── Sticky Bottom Action Bar ── */}
      {offeringType && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 safe-area-pb">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 lg:flex lg:items-center lg:gap-6">
            <div className="lg:flex-1 lg:max-w-2xl">
              {!canPublish && firstMissingLabel && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 font-semibold">
                    Missing required field: {firstMissingLabel}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!title.trim()}
                  className="h-11 sm:h-12 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shrink-0 lg:hidden"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Preview</span>
                </button>

                {!isEditMode && (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="h-11 sm:h-12 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors hidden sm:flex items-center gap-2"
                  >
                    Save Draft
                  </button>
                )}

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={handleSubmit as any}
                  disabled={isSubmitting || processingPhotos || !canPublish}
                  data-onboarding="sell-publish"
                  className={`h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-bold text-sm shadow-lg transition-all duration-200 flex items-center gap-2 ${canPublish
                    ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Publish Listing'}
                </button>
              </div>
            </div>
            {/* Spacer keeps the button block aligned with the form column on desktop */}
            <div className="hidden lg:block w-80 shrink-0" />
          </div>
        </div>
      )}

      {/* ── Discard Confirmation ── */}
      <Modal
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard changes?"
        subtitle="You have unsaved changes on this listing."
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDiscardOpen(false)}
              className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Keep editing
            </button>
            <button
              onClick={onBack}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors"
            >
              Discard
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">Nothing will be saved if you leave now.</p>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this listing?"
        subtitle={editingListing?.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Keep it
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </button>
          </div>
        }
      >
        {deleteError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-semibold">
            {deleteError}
          </div>
        )}
        <p className="text-sm text-slate-500">
          This can't be undone. Past conversations and deal history keep a reference, shown as "Listing removed".
        </p>
      </Modal>

      {/* ── Preview Overlay ── */}
      {previewOpen && previewListing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="relative w-full sm:max-w-lg sm:rounded-3xl bg-slate-50 sm:max-h-[90vh] overflow-y-auto sm:shadow-2xl ring-1 ring-white/10">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-slate-900">Preview</span>
                <span className="text-xs text-slate-400 font-medium">Buyer's view</span>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DetailScreen
              listing={previewListing}
              similarListings={[]}
              onBack={() => setPreviewOpen(false)}
              onToggleSave={() => { }}
              onSelectSimilar={() => { }}
              onOpenChat={() => { }}
              onViewSellerProfile={() => { }}
              // Stand-in for the preview only: DetailScreen wants a real session
              // and the seller may not have one loaded while drafting. Nothing
              // here is authorisation - the preview is inert, and every action
              // it renders is a no-op above.
              currentUser={currentUser ?? {
                id: 'me',
                name: 'You',
                email: '',
                avatar: '',
                role: 'customer',
                accountType: 'SELLER',
                sellerApprovalStatus: 'APPROVED',
                canSell: true,
                hasActiveListings: false,
              }}
              onOpenAuthModal={() => { }}
              embedded
            />
          </div>
        </div>
      )}
    </div>
  );
};
