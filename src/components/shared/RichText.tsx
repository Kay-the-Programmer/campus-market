import React, { Fragment, useMemo } from 'react';
import { Block, BlockSize, InlineNode, parseRichText } from '../../utils/richText';

/**
 * Renders a description written in the small format defined by richText.ts.
 *
 * The important property of this component is what it does not do: there is no
 * dangerouslySetInnerHTML anywhere in it. Seller-written text reaches the page
 * as React children, so a description containing a script tag renders the
 * characters of a script tag. Keeping it that way is the entire reason
 * descriptions are stored as markers rather than HTML - see richText.ts.
 */

/**
 * The two larger sizes get weight as well as size, because "make it bigger" in
 * practice means "make this the heading of a section".
 */
const SIZE_CLASS: Record<BlockSize, string> = {
  normal: '',
  // A heading that follows a paragraph needs air above it, but not when it is
  // the first thing in the description.
  medium: 'text-[0.95rem] font-semibold text-slate-800 mt-3 first:mt-0',
  large: 'text-lg font-bold text-slate-900 mt-4 first:mt-0',
};

function renderInline(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, index) => {
    // Index keys are safe here: the tree is derived from the string, so it is
    // rebuilt wholesale whenever the string changes and never reordered.
    if (node.kind === 'text') return <Fragment key={index}>{node.text}</Fragment>;
    if (node.kind === 'bold') {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {renderInline(node.children)}
        </strong>
      );
    }
    return <em key={index}>{renderInline(node.children)}</em>;
  });
}

const BlockLine: React.FC<{ block: Block }> = ({ block }) => {
  // A blank source line is a paragraph break. It renders as space rather than an
  // empty <p>, which would collapse to nothing.
  if (block.children.length === 0) {
    return <div aria-hidden="true" className="h-3" />;
  }
  return <p className={SIZE_CLASS[block.size]}>{renderInline(block.children)}</p>;
};

interface RichTextProps {
  /** The raw description, markers and all. */
  value: string | null | undefined;
  /**
   * Applied to the wrapper. Size and colour set here are inherited by every
   * normal line, so callers keep control of the base look.
   */
  className?: string;
}

export const RichText: React.FC<RichTextProps> = ({ value, className = '' }) => {
  const blocks = useMemo(() => parseRichText(value), [value]);

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <BlockLine key={index} block={block} />
      ))}
    </div>
  );
};
