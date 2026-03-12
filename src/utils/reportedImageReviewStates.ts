export type ReportedImageReviewMainState =
  | 'ready'
  | 'empty-category'
  | 'no-reported-data';

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
    totalReportedItemCount,
  } = input;

  if (visibleReportedItemCount > 0) return 'ready';
  if (totalReportedItemCount === 0) return 'no-reported-data';
  if (isCategorySelected) return 'empty-category';
  return 'no-reported-data';
}
