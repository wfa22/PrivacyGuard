import React, {useState, useEffect, useRef, useCallback} from 'react';
import {Card, CardContent} from './ui/card';
import {Button} from './ui/button';
import {Badge} from './ui/badge';
import {Alert, AlertDescription} from './ui/alert';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Textarea} from './ui/textarea';
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
    DialogDescription,
} from './ui/dialog';
import {ImageWithFallback} from './figma/ImageWithFallback';
import {
    Download, Trash2, Shield, Calendar, FileVideo, FileImage,
    AlertCircle, Loader2, Search, ArrowUpDown, Pencil,
    ChevronLeft, ChevronRight, CheckCircle, Scissors,
} from 'lucide-react';
import {api, MediaResponse, PaginatedMediaResponse, User} from '../utils/api';
import {SEOHead} from './SEOHead';
import {previewCache} from '../utils/request-cache';
import {SkeletonGrid} from './SkeletonCard';

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
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, 'dots', total];
    if (cur >= total - 2) return [1, 'dots', total - 3, total - 2, total - 1, total];
    return [1, 'dots', cur - 1, cur, cur + 1, 'dots', total];
}

/**
 * SQLite хранит boolean как 0/1. JSON может прийти как число.
 * Эта функция гарантирует корректную проверку.
 */
function isBgRemoved(item: MediaResponse): boolean {
    const val = item.bg_removed;
    if (val === true) return true;
    if (val === 1) return true;
    if (val === 'true') return true;
    if (val === '1') return true;
    return false;
}

const selectContentClass = "bg-white border border-gray-200 shadow-lg z-50";
const selectItemClass = "text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:text-gray-900 cursor-pointer";

interface DashboardPageProps {
    onNavigate: (page: any) => void;
    user: User | null;
}

export function DashboardPage({onNavigate, user}: DashboardPageProps) {
    const isAdmin = user?.role === 'admin';
    const PAGE_SIZE = 9;

    const [searchInput, setSearchInput] = useState(() => urlParam('search', ''));
    const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
    const [processedFilter, setProcessedFilter] = useState(() => urlParam('processed', 'all'));
    const [fileTypeFilter, setFileTypeFilter] = useState(() => urlParam('file_type', 'all'));
    const [dateFrom, setDateFrom] = useState(() => urlParam('date_from', ''));
    const [dateTo, setDateTo] = useState(() => urlParam('date_to', ''));
    const [sortBy, setSortBy] = useState(() => urlParam('sort_by', 'created_at'));
    const [sortOrder, setSortOrder] = useState(() => urlParam('sort_order', 'desc'));
    const [page, setPage] = useState(urlPageParam);

    const [data, setData] = useState<PaginatedMediaResponse | null>(null);
    const [previews, setPreviews] = useState<Record<number, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Edit dialog state
    const [editItem, setEditItem] = useState<MediaResponse | null>(null);
    const [editDesc, setEditDesc] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const abortControllerRef = useRef<AbortController | null>(null);

    // Auto-dismiss success
    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(null), 3000);
        return () => clearTimeout(t);
    }, [successMsg]);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => {
            if (searchInput !== debouncedSearch) {
                setDebouncedSearch(searchInput);
                setPage(1);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Sync state → URL
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

    // Fetch data
    useEffect(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

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
                if (controller.signal.aborted) return;

                setData(resp);
                loadPreviews(resp.items, controller.signal);
            } catch (err: any) {
                if (controller.signal.aborted) return;
                setError(err.message || 'Failed to load files');
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        fetchMedia();
        return () => {
            controller.abort();
        };
    }, [debouncedSearch, processedFilter, fileTypeFilter, dateFrom, dateTo, sortBy, sortOrder, page]);

    // Load previews with cache
    const loadPreviews = useCallback(async (items: MediaResponse[], signal: AbortSignal) => {
        const imgs = items.filter(i => i.file_type === 'image');
        if (!imgs.length) {
            setPreviews({});
            return;
        }

        const cached: Record<number, string> = {};
        const toLoad: MediaResponse[] = [];

        for (const item of imgs) {
            const cacheKey = `preview_${item.id}`;
            const cachedUrl = previewCache.get(cacheKey);
            if (cachedUrl) {
                cached[item.id] = cachedUrl;
            } else {
                toLoad.push(item);
            }
        }

        if (Object.keys(cached).length > 0) {
            setPreviews(prev => ({...prev, ...cached}));
        }

        if (toLoad.length === 0) {
            setPreviews(cached);
            return;
        }

        const results = await Promise.allSettled(
            toLoad.map(async (item) => {
                if (signal.aborted) throw new Error('Aborted');
                const blob = await api.downloadMedia(item.id);
                return {id: item.id, url: URL.createObjectURL(blob)};
            }),
        );

        if (signal.aborted) return;

        const newPreviews: Record<number, string> = {...cached};
        for (const r of results) {
            if (r.status === 'fulfilled') {
                const {id, url} = r.value;
                newPreviews[id] = url;
                previewCache.set(`preview_${id}`, url);
            }
        }

        setPreviews(newPreviews);
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
            loadPreviews(resp.items, new AbortController().signal);
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
            await api.updateMedia(editItem.id, {description: editDesc});
            setSuccessMsg('Description updated');
            setEditItem(null);
            setData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    items: prev.items.map(item =>
                        item.id === editItem.id
                            ? {...item, description: editDesc}
                            : item
                    ),
                };
            });
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

    return (
        <>
            <SEOHead
                title="Dashboard"
                description="Manage your processed media files."
                path="/dashboard"
                noIndex={true}
            />

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* EDIT DIALOG — вынесен на верхний уровень, ВМЕСТЕ с Portal  */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* WHY вынесен сюда: Radix Dialog использует Portal и рендерит */}
            {/* в document.body. Но если Dialog внутри overflow:hidden       */}
            {/* контейнера или вложенного scroll — он может быть обрезан.   */}
            {/* Размещение вне <main> гарантирует видимость.                */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <Dialog
                open={!!editItem}
                onOpenChange={(open) => {
                    if (!open) setEditItem(null);
                }}
            >
                <DialogContent
                    className="bg-white border border-gray-200 shadow-xl sm:max-w-md"
                    style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 9999,
                        maxHeight: '90vh',
                        overflow: 'auto',
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-gray-900">Edit File Description</DialogTitle>
                        <DialogDescription className="text-gray-500">
                            Update the description for this file. Click save when done.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Filename (read-only) */}
                        <div>
                            <Label className="text-sm text-muted-foreground">Filename</Label>
                            <p className="font-medium text-sm text-gray-900 mt-1 break-all">
                                {editItem?.original_filename || `File #${editItem?.id}`}
                            </p>
                        </div>

                        {/* File info */}
                        <div className="flex gap-2 flex-wrap">
                            {editItem?.file_type && (
                                <Badge variant="outline" className="text-xs">
                                    {editItem.file_type}
                                </Badge>
                            )}
                            {editItem?.processed && (
                                <Badge variant="default" className="text-xs">
                                    Processed
                                </Badge>
                            )}
                            {editItem && isBgRemoved(editItem) && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                    style={{backgroundColor: '#8b5cf6'}}
                                >
                <Scissors className="w-3 h-3" aria-hidden="true"/>
                BG Removed
              </span>
                            )}
                        </div>

                        {/* Description textarea */}
                        <div>
                            <Label htmlFor="edit-desc" className="text-gray-900">Description</Label>
                            <Textarea
                                id="edit-desc"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                placeholder="Add a description…"
                                rows={3}
                                className="mt-1 bg-white text-gray-900 border-gray-300 focus:border-primary"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                        <Button
                            variant="outline"
                            onClick={() => setEditItem(null)}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true"/>
                                    Saving…
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <main className="min-h-screen bg-secondary/10 py-8">
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
                        <Alert variant="destructive" className="mb-4" role="alert">
                            <AlertCircle className="h-4 w-4" aria-hidden="true"/>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {successMsg && (
                        <Alert className="mb-4 border-green-500 bg-green-50" role="status">
                            <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true"/>
                            <AlertDescription className="text-green-800">{successMsg}</AlertDescription>
                        </Alert>
                    )}

                    {/* FILTERS */}
                    <Card className="mb-6">
                        <CardContent className="p-4 space-y-4">
                            <div className="relative">
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                    aria-hidden="true"/>
                                <Input
                                    placeholder="Search by filename or description…"
                                    value={searchInput}
                                    onChange={e => setSearchInput(e.target.value)}
                                    className="pl-10"
                                    aria-label="Search files"
                                />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                                <div>
                                    <Label className="text-xs mb-1 block">Status</Label>
                                    <Select value={processedFilter} onValueChange={v => {
                                        setProcessedFilter(v);
                                        setPage(1);
                                    }}>
                                        <SelectTrigger className="bg-white text-gray-900 border-gray-300"><SelectValue/></SelectTrigger>
                                        <SelectContent className={selectContentClass}>
                                            <SelectItem value="all" className={selectItemClass}>All</SelectItem>
                                            <SelectItem value="true" className={selectItemClass}>Processed</SelectItem>
                                            <SelectItem value="false" className={selectItemClass}>Pending</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block">Type</Label>
                                    <Select value={fileTypeFilter} onValueChange={v => {
                                        setFileTypeFilter(v);
                                        setPage(1);
                                    }}>
                                        <SelectTrigger className="bg-white text-gray-900 border-gray-300"><SelectValue/></SelectTrigger>
                                        <SelectContent className={selectContentClass}>
                                            <SelectItem value="all" className={selectItemClass}>All</SelectItem>
                                            <SelectItem value="image" className={selectItemClass}>Images</SelectItem>
                                            <SelectItem value="video" className={selectItemClass}>Videos</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block">From</Label>
                                    <Input type="date" value={dateFrom} onChange={e => {
                                        setDateFrom(e.target.value);
                                        setPage(1);
                                    }} aria-label="From date"/>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block">To</Label>
                                    <Input type="date" value={dateTo} onChange={e => {
                                        setDateTo(e.target.value);
                                        setPage(1);
                                    }} aria-label="To date"/>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block">Sort by</Label>
                                    <Select value={sortBy} onValueChange={setSortBy}>
                                        <SelectTrigger className="bg-white text-gray-900 border-gray-300"><SelectValue/></SelectTrigger>
                                        <SelectContent className={selectContentClass}>
                                            <SelectItem value="created_at" className={selectItemClass}>Date</SelectItem>
                                            <SelectItem value="original_filename"
                                                        className={selectItemClass}>Filename</SelectItem>
                                            <SelectItem value="file_size" className={selectItemClass}>Size</SelectItem>
                                            <SelectItem value="id" className={selectItemClass}>ID</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block">Order</Label>
                                    <Button variant="outline" className="w-full justify-start gap-2"
                                            onClick={toggleOrder}
                                            aria-label={`Sort: ${sortOrder === 'desc' ? 'newest' : 'oldest'} first`}>
                                        <ArrowUpDown className="h-4 w-4" aria-hidden="true"/>
                                        {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
                                    </Button>
                                </div>

                                <div>
                                    <Label className="text-xs mb-1 block invisible">_</Label>
                                    {hasFilters ? (
                                        <Button variant="ghost" className="w-full" onClick={resetFilters}>Reset</Button>
                                    ) : (
                                        <Button className="w-full"
                                                onClick={() => onNavigate('censoring')}>Upload</Button>
                                    )}
                                </div>
                            </div>

                            <div
                                className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t">
                                <span>{data ? `${data.total} file${data.total !== 1 ? 's' : ''} found` : '…'}</span>
                                {hasFilters && (
                                    <Button variant="link" size="sm" className="h-auto p-0" onClick={resetFilters}>Clear
                                        all filters</Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* CONTENT */}
                    {isLoading ? (
                        <SkeletonGrid count={PAGE_SIZE}/>
                    ) : !data || data.items.length === 0 ? (
                        <Card>
                            <CardContent className="p-12 text-center">
                                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" aria-hidden="true"/>
                                <h2 className="text-lg font-semibold mb-2">
                                    {hasFilters ? 'No files match your filters' : 'No files yet'}
                                </h2>
                                <p className="text-muted-foreground mb-4">
                                    {hasFilters ? 'Try adjusting your search or filters' : 'Upload and process your first files'}
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
                                        <div className="relative h-48 bg-muted">
                                            {item.file_type === 'image' && previews[item.id] ? (
                                                <ImageWithFallback
                                                    src={previews[item.id]}
                                                    alt={`Processed file: ${item.original_filename || `File #${item.id}`}`}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    {item.file_type === 'video'
                                                        ? <FileVideo className="w-12 h-12 text-muted-foreground"
                                                                     aria-hidden="true"/>
                                                        : <FileImage className="w-12 h-12 text-muted-foreground"
                                                                     aria-hidden="true"/>}
                                                </div>
                                            )}

                                            {/* ═══ Бейджи статуса ═══ */}
                                            <div className="absolute top-2 right-2 flex flex-wrap gap-1">
                                                <Badge
                                                    variant={item.processed ? 'default' : 'secondary'}
                                                    className="text-xs"
                                                >
                                                    {item.processed ? 'Processed' : 'Pending'}
                                                </Badge>

                                                {/* BG Removed бейдж — используем helper для надёжной проверки */}
                                                {isBgRemoved(item) && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                                        style={{backgroundColor: '#8b5cf6'}}
                                                    >
                            <Scissors className="w-3 h-3" aria-hidden="true"/>
                            BG
                          </span>
                                                )}
                                            </div>

                                            {isAdmin && (
                                                <Badge variant="outline"
                                                       className="absolute top-2 left-2 bg-black/60 text-white border-none text-xs">
                                                    User #{item.user_id}
                                                </Badge>
                                            )}
                                        </div>

                                        <CardContent className="p-4 space-y-2">
                                            <h3 className="font-semibold truncate text-sm"
                                                title={item.original_filename || ''}>
                                                {item.original_filename || `File #${item.id}`}
                                            </h3>

                                            {item.description && (
                                                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                                            )}

                                            <div
                                                className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" aria-hidden="true"/>
                          <time dateTime={item.created_at || ''}>{fmtDate(item.created_at)}</time>
                        </span>
                                                <span>{fmtSize(item.file_size)}</span>
                                                <Badge variant="outline"
                                                       className="text-xs px-1.5 py-0">{item.file_type || 'file'}</Badge>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-1 pt-1">
                                                <Button size="sm" className="flex-1 h-8 text-xs"
                                                        onClick={() => handleDownload(item)}>
                                                    <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true"/>
                                                    Download
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8"
                                                    onClick={() => openEdit(item)}
                                                    aria-label={`Edit description of ${item.original_filename || 'file'}`}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" aria-hidden="true"/>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => handleDelete(item)}
                                                    aria-label={`Delete ${item.original_filename || 'file'}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true"/>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* PAGINATION */}
                            {totalPages > 1 && (
                                <nav className="flex items-center justify-center gap-1 flex-wrap"
                                     aria-label="Pagination">
                                    <Button variant="outline" size="sm" disabled={page <= 1}
                                            onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                                        <ChevronLeft className="w-4 h-4" aria-hidden="true"/>
                                    </Button>
                                    {pageNums(page, totalPages).map((p, i) =>
                                        p === 'dots' ? (
                                            <span key={`d${i}`} className="px-2 text-muted-foreground select-none"
                                                  aria-hidden="true">…</span>
                                        ) : (
                                            <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm"
                                                    className="w-9" onClick={() => setPage(p as number)}
                                                    aria-label={`Page ${p}`}
                                                    aria-current={p === page ? 'page' : undefined}>
                                                {p}
                                            </Button>
                                        ),
                                    )}
                                    <Button variant="outline" size="sm" disabled={page >= totalPages}
                                            onClick={() => setPage(p => p + 1)} aria-label="Next page">
                                        <ChevronRight className="w-4 h-4" aria-hidden="true"/>
                                    </Button>
                                    <span
                                        className="ml-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                                </nav>
                            )}
                        </>
                    )}
                </div>
            </main>
        </>
    );
}