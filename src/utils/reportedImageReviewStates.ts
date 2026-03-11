export type ReportedImageReviewMainState =
  | 'ready'
  | 'empty-category'
  | 'no-reported-data'
  | 'reported-no-image';

export interface ResolveReportedImageReviewMainStateInput {
  isCategorySelected: boolean;
  visibleReportedItemCount: number;
  visibleReportedImageCount: number;
  totalReportedItemCount: number;
}

export function resolveReportedImageReviewMainState(
  input: ResolveReportedImageReviewMainStateInput
): ReportedImageReviewMainState {
  const {
    isCategorySelected,
    visibleReportedItemCount,
    visibleReportedImageCount,
    totalReportedItemCount,
  } = input;

  if (visibleReportedImageCount > 0) return 'ready';
  if (visibleReportedItemCount > 0) return 'reported-no-image';
  if (totalReportedItemCount === 0) return 'no-reported-data';
  if (isCategorySelected) return 'empty-category';
  return 'no-reported-data';
}
