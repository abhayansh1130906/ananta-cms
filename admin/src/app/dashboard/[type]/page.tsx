"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useContentType, useContentItems } from "@/lib/query";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Edit,
  Trash2,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { ContentItem } from "@/types/cms";

export default function ContentTypeListPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: contentType, isLoading: typeLoading } = useContentType(type);
  const { data: items, isLoading: itemsLoading } = useContentItems(type);

  const [prevItems, setPrevItems] = useState(items);
  const [orderedItems, setOrderedItems] = useState<ContentItem[]>(() => items || []);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync items into local state for drag-and-drop
  if (items && items !== prevItems) {
    setPrevItems(items);
    setOrderedItems(items);
  }

  // Singleton redirect rule: singleton types skip the list and open the item directly
  useEffect(() => {
    if (contentType?.is_singleton && !itemsLoading && items) {
      const activeItem = items.find((i) => !i.is_deleted);
      if (activeItem) {
        router.replace(`/dashboard/${type}/${activeItem.id}`);
      } else {
        router.replace(`/dashboard/${type}/new`);
      }
    }
  }, [contentType?.is_singleton, itemsLoading, items, type, router]);

  // DND Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.findIndex((item) => item.id === active.id);
    const newIndex = orderedItems.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const previous = [...orderedItems];
    const reordered = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(reordered);

    try {
      await api.reorderContentItems(
        type,
        reordered.map((i) => i.id)
      );
      toast.success("Order updated");
      queryClient.invalidateQueries({ queryKey: ["contentItems", type] });
    } catch (err: unknown) {
      setOrderedItems(previous);
      const msg = err instanceof Error ? err.message : "Failed to reorder items";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteContentItem(type, deleteTarget.id);
      toast.success("Item marked as deleted. Will be removed on next publish.");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["contentItems", type] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete item";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (typeLoading || (contentType?.is_singleton && itemsLoading)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
        <div className="h-64 border rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  if (!contentType) {
    return (
      <div className="p-8 text-center border rounded-xl bg-card">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <h2 className="text-lg font-semibold">Content Type Not Found</h2>
        <p className="text-sm text-muted-foreground mt-1">
          The requested content type &apos;{type}&apos; does not exist.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </div>
    );
  }

  // Helper to extract the primary display title
  const getItemTitle = (item: ContentItem) => {
    const data = item.draft_data || {};
    return (
      (data.title as string) ||
      (data.name as string) ||
      (data.question as string) ||
      (data.day as string) ||
      item.slug
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{contentType.name}</h1>
          <p className="text-sm text-muted-foreground">
            Manage and reorder items for the &apos;{contentType.key}&apos; schema
          </p>
        </div>

        <Button asChild className="gap-1.5 shadow-xs">
          <Link href={`/dashboard/${type}/new`}>
            <Plus className="h-4 w-4" />
            <span>New {contentType.name.replace(/s$/, "")}</span>
          </Link>
        </Button>
      </div>

      {/* Items Table */}
      {itemsLoading ? (
        <div className="border rounded-xl p-8 bg-card flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mb-2" />
          <p className="text-sm">Loading items...</p>
        </div>
      ) : orderedItems.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center bg-card/50">
          <FileText className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="font-semibold text-base">No items found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Get started by creating your first entry for {contentType.name.toLowerCase()}.
          </p>
          <Button asChild className="mt-4 gap-1.5">
            <Link href={`/dashboard/${type}/new`}>
              <Plus className="h-4 w-4" />
              Create Item
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={orderedItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedItems.map((item) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      type={type}
                      title={getItemTitle(item)}
                      onDeleteClick={() => setDeleteTarget(item)}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soft Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &apos;{deleteTarget ? getItemTitle(deleteTarget) : ""}&apos;?
              <br />
              <span className="text-destructive font-medium mt-1 inline-block">
                This item will be marked as deleted and permanently excluded on the next publish.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sortable Table Row Component
function SortableRow({
  item,
  type,
  title,
  onDeleteClick,
}: {
  item: ContentItem;
  type: string;
  title: string;
  onDeleteClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`group ${item.is_deleted ? "opacity-60 bg-muted/20" : ""}`}
    >
      <TableCell className="w-10 px-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground p-1 rounded-sm"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      <TableCell className="font-medium">
        <Link
          href={`/dashboard/${type}/${item.id}`}
          className="hover:underline flex items-center gap-1.5"
        >
          <span className="truncate max-w-[200px] sm:max-w-xs">{title}</span>
        </Link>
      </TableCell>

      <TableCell className="font-mono text-xs text-muted-foreground">{item.slug}</TableCell>

      <TableCell>
        {item.is_deleted ? (
          <Badge variant="destructive" className="text-[11px]">
            Deleted-pending
          </Badge>
        ) : item.has_unpublished_changes && item.published_data !== null ? (
          <Badge
            variant="outline"
            className="text-[11px] border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
          >
            Unpublished changes
          </Badge>
        ) : item.status === "published" ? (
          <Badge
            variant="default"
            className="text-[11px] bg-emerald-600 dark:bg-emerald-700 text-white"
          >
            Published
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[11px]">
            Draft
          </Badge>
        )}
      </TableCell>

      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={`/dashboard/${type}/${item.id}`} title="Edit item">
              <Edit className="h-3.5 w-3.5" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={onDeleteClick}
            disabled={item.is_deleted}
            title="Delete item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
