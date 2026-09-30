import React from 'react';
import {
  BookOpen, Sofa, Bike, Shirt, Laptop, Dumbbell, Music, Wrench, Utensils,
  ShoppingBag, Ticket, GraduationCap,
} from 'lucide-react';

/**
 * Icon for a category, guessed from its name.
 *
 * <p>Categories are admin-created and carry no picture, so the alternative to
 * guessing is the same grey circle forty times - which makes a row people are
 * supposed to scan impossible to scan. A wrong-but-plausible icon costs
 * nothing, because the name is always right next to it: the icon is doing
 * wayfinding, not identification.
 *
 * <p>Shared by the categories index and the browse strip so one category
 * cannot be a book in one place and a bag in the other.
 */
export function categoryIcon(name: string, className = 'w-5 h-5'): React.ReactNode {
  const n = (name ?? '').toLowerCase();
  if (/book|text|stud|note/.test(n)) return <BookOpen className={className} />;
  if (/furni|sofa|desk|chair|bed/.test(n)) return <Sofa className={className} />;
  if (/bike|cycle|scoot/.test(n)) return <Bike className={className} />;
  if (/cloth|shirt|wear|fashion|shoe/.test(n)) return <Shirt className={className} />;
  if (/laptop|comput|phone|electr|tech/.test(n)) return <Laptop className={className} />;
  if (/sport|gym|fit/.test(n)) return <Dumbbell className={className} />;
  if (/music|instrum|audio/.test(n)) return <Music className={className} />;
  if (/food|meal|snack|drink|cook/.test(n)) return <Utensils className={className} />;
  if (/ticket|event|show/.test(n)) return <Ticket className={className} />;
  if (/tutor|lesson|class|teach/.test(n)) return <GraduationCap className={className} />;
  if (/service|repair|clean|ride|move/.test(n)) return <Wrench className={className} />;
  return <ShoppingBag className={className} />;
}
