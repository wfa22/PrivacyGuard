import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ImageWithFallback } from './figma/ImageWithFallback';
import {
  Download, Trash2, Shield, Calendar, FileVideo, FileImage,
  AlertCircle, Loader2, Search, ArrowUpDown, Pencil,
  ChevronLeft, ChevronRight, CheckCircle,
} from 'lucide-react';
import { api, MediaResponse, PaginatedMediaResponse, User } from '../utils/api';

// ── Helpers ──────────────────────────────────────────────────────

function urlParam(key: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(key) || fallback;
}

function urlPageParam(): number {
  return parseInt(new URLSearchParams(window.location.search).get('page') || '1') || 1;
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function pageNums(cur: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 3) return [1, 2, 3, 4, 'dots', total];
  if (cur >= total - 2) return [1, 'dots', total - 3, total - 2, total - 1, total];
  return [1, 'dots', cur - 1, cur, cur + 1, 'dots', total];
}

// ── Стили для выпадающих списков ─────────────────────────────────
const selectContentClass = "bg-white border border-gray-200 shadow-lg z-50";
const selectItemClass = "text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:text-gray-900 cursor-pointer";

// ── Props ────────────────────────────────────────────────────────

interface DashboardPageProps {
  onNavigate: (page: any) => void;
  user: User | null;
}

// ── Component ────────────────────────────────────────────────────

export function DashboardPage({ onNavigate, user }: DashboardPageProps) {
  const isAdmin = user?.role === 'admin';
  const PAGE_SIZE = 9;

  // Filter state — initialised from URL for persistence (п.2.4)
  const [searchInput, setSearchInput] = useState(() => urlParam('search', ''));
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const [processedFilter, setProcessedFilter] = useState(() => urlParam('processed', 'all'));
  const [fileTypeFilter, setFileTypeFilter] = useState(() => urlParam('file_type', 'all'));
  const [dateFrom, setDateFrom] = useState(() => urlParam('date_from', ''));
  const [dateTo, setDateTo] = useState(() => urlParam('date_to', ''));
  const [sortBy, setSortBy] = useState(() => urlParam('sort_by', 'created_at'));
  const [sortOrder, setSortOrder] = useState(() => urlParam('sort_order', 'desc'));
  const [page, setPage] = useState(urlPageParam);

  // Data
  const [data, setData] = useState<PaginatedMediaResponse | null>(null);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const previewsRef = useRef<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit dialog
  const [editItem, setEditItem] = useState<MediaResponse | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ── Auto-dismiss success ──
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Debounce search ──
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== debouncedSearch) {
        setDebouncedSearch(searchInput);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Sync state → URL (п.2.4) ──
  useEffect(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (processedFilter !== 'all') p.set('processed', processedFilter);
    if (fileTypeFilter !== 'all') p.set('file_type', fileTypeFilter);
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    if (sortBy !== 'created_at') p.set('sort_by', sortBy);
    if (sortOrder !== 'desc') p.set('sort_order', sortOrder);
    if (page > 1) p.set('page', String(page));
    const q = p.toString();
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
  }, [debouncedSearch, processedFilter, fileTypeFilter, dateFrom, dateTo, sortBy, sortOrder, page]);

  // ── Fetch data ──
  useEffect(() => {
    fetchMedia();
  }, [debouncedSearch, processedFilter, fileTypeFilter, dateFrom, dateTo, sortBy, sortOrder, page]);

  const fetchMedia = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (processedFilter !== 'all') params.processed = processedFilter === 'true';
      if (fileTypeFilter !== 'all') params.file_type = fileTypeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const resp = await api.listMedia(params);
      setData(resp);
      loadPreviews(resp.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Preview blobs ──
  const loadPreviews = async (items: MediaResponse[]) => {
    Object.values(previewsRef.current).forEach(u => URL.revokeObjectURL(u));
    previewsRef.current = {};
    setPreviews({});

    const imgs = items.filter(i => i.file_type === 'image');
    if (!imgs.length) return;

    const results = await Promise.allSettled(
      imgs.map(async (item) => {
        const blob = await api.downloadMedia(item.id);
        return { id: item.id, url: URL.createObjectURL(blob) };
      }),
    );
    const map: Record<number, string> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') map[r.value.id] = r.value.url;
    }
    previewsRef.current = map;
    setPreviews(map);
  };

  useEffect(() => () => {
    Object.values(previewsRef.current).forEach(u => URL.revokeObjectURL(u));
  }, []);

  // ── Handlers ──

  const handleDownload = async (item: MediaResponse) => {
    try {
      setError(null);
      const blob = await api.downloadMedia(item.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.original_filename || `file-${item.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  };

  const handleDelete = async (item: MediaResponse) => {
    if (!confirm(`Delete "${item.original_filename || 'file'}"?`)) return;
    setError(null);
    try {
      await api.deleteMedia(item.id);
      setSuccessMsg('File deleted');
      fetchMedia();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const openEdit = (item: MediaResponse) => {
    setEditItem(item);
    setEditDesc(item.description || '');
  };

  const handleSave = async () => {
    if (!editItem) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.updateMedia(editItem.id, { description: editDesc });
      setSuccessMsg('Description updated');
      setEditItem(null);
      fetchMedia();
    } catch (err: any) {
      setError(err.message || 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setProcessedFilter('all');
    setFileTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const toggleOrder = () => setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));

  const hasFilters =
    !!debouncedSearch ||
    processedFilter !== 'all' ||
    fileTypeFilter !== 'all' ||
    !!dateFrom ||
    !!dateTo;

  const totalPages = data?.pages || 0;

  // ── Render ──

  return (
    <div className="min-h-screen bg-secondary/10 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary mb-1">Dashboard</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'Admin view — all users\' files' : 'Manage your processed files'}
          </p>
          {isAdmin && <Badge className="mt-2">Admin Mode</Badge>}
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {successMsg && (
          <Alert className="mb-4 border-green-500 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* ═══ FILTERS CARD ═══ */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by filename or description…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">

              {/* Status */}
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select
                  value={processedFilter}
                  onValueChange={v => { setProcessedFilter(v); setPage(1); }}
                >
                  <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value="all" className={selectItemClass}>All</SelectItem>
                    <SelectItem value="true" className={selectItemClass}>Processed</SelectItem>
                    <SelectItem value="false" className={selectItemClass}>Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type */}
              <div>
                <Label className="text-xs mb-1 block">Type</Label>
                <Select
                  value={fileTypeFilter}
                  onValueChange={v => { setFileTypeFilter(v); setPage(1); }}
                >
                  <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value="all" className={selectItemClass}>All</SelectItem>
                    <SelectItem value="image" className={selectItemClass}>Images</SelectItem>
                    <SelectItem value="video" className={selectItemClass}>Videos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div>
                <Label className="text-xs mb-1 block">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                />
              </div>

              {/* Date To */}
              <div>
                <Label className="text-xs mb-1 block">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                />
              </div>

              {/* Sort By */}
              <div>
                <Label className="text-xs mb-1 block">Sort by</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value="created_at" className={selectItemClass}>Date</SelectItem>
                    <SelectItem value="original_filename" className={selectItemClass}>Filename</SelectItem>
                    <SelectItem value="file_size" className={selectItemClass}>Size</SelectItem>
                    <SelectItem value="id" className={selectItemClass}>ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div>
                <Label className="text-xs mb-1 block">Order</Label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={toggleOrder}
                >
                  <ArrowUpDown className="h-4 w-4" />
                  {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
                </Button>
              </div>

              {/* Reset */}
              <div>
                <Label className="text-xs mb-1 block invisible">_</Label>
                {hasFilters ? (
                  <Button variant="ghost" className="w-full" onClick={resetFilters}>
                    Reset
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => onNavigate('censoring')}>
                    Upload
                  </Button>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t">
              <span>
                {data ? `${data.total} file${data.total !== 1 ? 's' : ''} found` : '…'}
              </span>
              {hasFilters && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={resetFilters}>
                  Clear all filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ═══ CONTENT ═══ */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Loading files…</p>
            </CardContent>
          </Card>
        ) : !data || data.items.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {hasFilters ? 'No files match your filters' : 'No files yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {hasFilters
                  ? 'Try adjusting your search or filters'
                  : 'Upload and process your first files'}
              </p>
              {hasFilters ? (
                <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
              ) : (
                <Button onClick={() => onNavigate('censoring')}>Upload Files</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* File Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {data.items.map(item => (
                <Card key={item.id} className="overflow-hidden">
                  {/* Preview */}
                  <div className="relative h-48 bg-muted">
                    {item.file_type === 'image' && previews[item.id] ? (
                      <ImageWithFallback
                        src={previews[item.id]}
                        alt={item.original_filename || ''}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.file_type === 'video'
                          ? <FileVideo className="w-12 h-12 text-muted-foreground" />
                          : <FileImage className="w-12 h-12 text-muted-foreground" />}
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge
                        variant={item.processed ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {item.processed ? 'Processed' : 'Pending'}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <Badge
                        variant="outline"
                        className="absolute top-2 left-2 bg-black/60 text-white border-none text-xs"
                      >
                        User #{item.user_id}
                      </Badge>
                    )}
                  </div>

                  {/* Info */}
                  <CardContent className="p-4 space-y-2">
                    <h3
                      className="font-semibold truncate text-sm"
                      title={item.original_filename || ''}
                    >
                      {item.original_filename || `File #${item.id}`}
                    </h3>

                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {fmtDate(item.created_at)}
                      </span>
                      <span>{fmtSize(item.file_size)}</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {item.file_type || 'file'}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleDownload(item)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openEdit(item)}
                        title="Edit description"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(item)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ═══ PAGINATION ═══ */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {pageNums(page, totalPages).map((p, i) =>
                  p === 'dots' ? (
                    <span key={`d${i}`} className="px-2 text-muted-foreground select-none">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      className="w-9"
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  ),
                )}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                <span className="ml-3 text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}

        {/* ═══ EDIT DIALOG ═══ */}
        <Dialog open={!!editItem} onOpenChange={open => { if (!open) setEditItem(null); }}>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Edit File</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm text-muted-foreground">Filename</Label>
                <p className="font-medium text-sm text-gray-900">{editItem?.original_filename}</p>
              </div>
              <div>
                <Label htmlFor="edit-desc" className="text-gray-900">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Add a description…"
                  rows={3}
                  className="bg-white text-gray-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditItem(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}