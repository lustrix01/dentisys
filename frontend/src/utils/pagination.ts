export interface PaginatedResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

/**
 * Paginate an array of items.
 * @param items - The full array of items.
 * @param page - 1‑based page number.
 * @param pageSize - Number of items per page.
 * @returns PaginatedResult with sliced items and metadata.
 */
export function paginate<T>(items: T[], page: number = 1, pageSize: number = 10): PaginatedResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pagedItems = items.slice(start, end);
  return {
    items: pagedItems,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
  };
}
