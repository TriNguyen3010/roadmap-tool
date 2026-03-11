import { describe, expect, it } from 'vitest';
import { resolveReportedImageReviewMainState } from './reportedImageReviewStates';

describe('resolveReportedImageReviewMainState', () => {
  it('returns ready when there is at least one visible image card', () => {
    expect(resolveReportedImageReviewMainState({
      isCategorySelected: false,
      visibleReportedItemCount: 3,
      visibleReportedImageCount: 1,
      totalReportedItemCount: 3,
    })).toBe('ready');
  });

  it('returns reported-no-image when reported items exist but no image', () => {
    expect(resolveReportedImageReviewMainState({
      isCategorySelected: true,
      visibleReportedItemCount: 2,
      visibleReportedImageCount: 0,
      totalReportedItemCount: 4,
    })).toBe('reported-no-image');
  });

  it('returns no-reported-data when there is no reported item at all', () => {
    expect(resolveReportedImageReviewMainState({
      isCategorySelected: false,
      visibleReportedItemCount: 0,
      visibleReportedImageCount: 0,
      totalReportedItemCount: 0,
    })).toBe('no-reported-data');
  });

  it('returns empty-category when selected category has no reported item but other categories have data', () => {
    expect(resolveReportedImageReviewMainState({
      isCategorySelected: true,
      visibleReportedItemCount: 0,
      visibleReportedImageCount: 0,
      totalReportedItemCount: 5,
    })).toBe('empty-category');
  });
});
