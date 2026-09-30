"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Code2,
  Save,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/lib/query";
import { api } from "@/lib/api";
import type { ContentType, Field, FieldType } from "@/types/cms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALL_FIELD_TYPES: { type: FieldType; label: string; description: string }[] = [
  { type: "text", label: "Text", description: "Short or single-line text" },
  { type: "richtext", label: "Rich Text", description: "Formatted HTML text via TipTap editor" },
  { type: "number", label: "Number", description: "Numeric values" },
  { type: "date", label: "Date", description: "Calendar date (YYYY-MM-DD)" },
  { type: "time", label: "Time", description: "Time of day (HH:mm 24h)" },
  { type: "datetime", label: "Date & Time", description: "ISO timestamp (YYYY-MM-DDTHH:mm)" },
  { type: "image", label: "Image", description: "Direct storage upload with URL and alt text" },
  { type: "url", label: "URL", description: "External or internal web link" },
  { type: "boolean", label: "Boolean Switch", description: "True/false toggle switch" },
  { type: "select", label: "Select Dropdown", description: "Single choice from configured options" },
  { type: "list", label: "List", description: "Repeatable array of structured items" },
  { type: "group", label: "Group", description: "Nested object container" },
];

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// -------------------------------------------------------------
// Sortable Field Item Component (Recursive for nested `of`)
// -------------------------------------------------------------
interface SortableFieldItemProps {
  id: string;
  field: Field;
  index: number;
  total: number;
  onUpdate: (updated: Field) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  level?: number;
}

function SortableFieldItem({
  id,
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  level = 0,
}: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const [expanded, setExpanded] = useState(true);
  const [newOption, setNewOption] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  const handleLabelChange = (newLabel: string) => {
    // If name was default or derived, update name too if empty
    const shouldUpdateName = !field.name || field.name === toSnakeCase(field.label || "");
    onUpdate({
      ...field,
      label: newLabel,
      name: shouldUpdateName ? toSnakeCase(newLabel) : field.name,
    });
  };

  const handleTypeChange = (newType: FieldType) => {
    const updated: Field = {
      ...field,
      type: newType,
    };

    if (newType === "select" && (!updated.options || updated.options.length === 0)) {
      updated.options = ["Option 1", "Option 2"];
    }

    if ((newType === "list" || newType === "group") && (!updated.of || updated.of.length === 0)) {
      updated.of = [
        {
          name: "item_title",
          label: "Title",
          type: "text",
          required: true,
        },
      ];
    }

    onUpdate(updated);
  };

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    const current = field.options || [];
    onUpdate({
      ...field,
      options: [...current, newOption.trim()],
    });
    setNewOption("");
  };

  const handleRemoveOption = (optIndex: number) => {
    const current = field.options || [];
    onUpdate({
      ...field,
      options: current.filter((_, i) => i !== optIndex),
    });
  };

  // Subfield handlers for nested `of`
  const handleAddSubfield = () => {
    const currentOf = field.of || [];
    const newSubfield: Field = {
      name: `field_${currentOf.length + 1}`,
      label: `Field ${currentOf.length + 1}`,
      type: "text",
      required: false,
    };
    onUpdate({
      ...field,
      of: [...currentOf, newSubfield],
    });
  };

  const handleUpdateSubfield = (subIndex: number, updatedSub: Field) => {
    const currentOf = [...(field.of || [])];
    currentOf[subIndex] = updatedSub;
    onUpdate({
      ...field,
      of: currentOf,
    });
  };

  const handleRemoveSubfield = (subIndex: number) => {
    const currentOf = (field.of || []).filter((_, i) => i !== subIndex);
    onUpdate({
      ...field,
      of: currentOf,
    });
  };

  const handleMoveSubfield = (subIndex: number, direction: "up" | "down") => {
    const currentOf = [...(field.of || [])];
    const target = direction === "up" ? subIndex - 1 : subIndex + 1;
    if (target < 0 || target >= currentOf.length) return;
    const temp = currentOf[subIndex];
    currentOf[subIndex] = currentOf[target];
    currentOf[target] = temp;
    onUpdate({
      ...field,
      of: currentOf,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-4 transition-shadow ${
        isDragging ? "shadow-lg border-primary" : "shadow-sm"
      } ${level > 0 ? "ml-4 border-l-4 border-l-primary/40 bg-muted/20" : ""}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-1 rounded hover:bg-muted"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-left font-medium text-foreground hover:text-primary truncate"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span className="truncate">{field.label || field.name || "Untitled Field"}</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
              {field.name || "no-key"}
            </code>
            <Badge variant="outline" className="text-xs capitalize font-normal">
              {field.type}
            </Badge>
            {field.required && (
              <Badge variant="secondary" className="text-[10px] text-destructive font-medium">
                Required
              </Badge>
            )}
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={onMoveUp}
            className="h-7 w-7 p-0"
            title="Move Up"
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="h-7 w-7 p-0"
            title="Move Down"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Remove Field"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Expanded configuration details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Label */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Display Label
              </label>
              <Input
                value={field.label || ""}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="e.g. Event Title"
                className="h-9"
              />
            </div>

            {/* Key / Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Field Key (snake_case)
              </label>
              <Input
                value={field.name}
                onChange={(e) =>
                  onUpdate({
                    ...field,
                    name: toSnakeCase(e.target.value),
                  })
                }
                placeholder="e.g. event_title"
                className="h-9 font-mono text-xs"
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Field Type
              </label>
              <Select
                value={field.type}
                onValueChange={(val) => handleTypeChange(val as FieldType)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_FIELD_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      <span className="font-medium">{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Required Switch */}
            <div className="flex flex-col justify-end pb-1">
              <div className="flex items-center justify-between border rounded-md px-3 h-9 bg-background">
                <span className="text-xs font-medium text-muted-foreground">Required</span>
                <Switch
                  checked={Boolean(field.required)}
                  onCheckedChange={(checked) => onUpdate({ ...field, required: checked })}
                />
              </div>
            </div>
          </div>

          {/* Special Type Config: SELECT options */}
          {field.type === "select" && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <label className="text-xs font-medium text-foreground block">
                Dropdown Options
              </label>
              <div className="flex flex-wrap gap-2">
                {(field.options || []).map((opt, optIdx) => (
                  <Badge
                    key={optIdx}
                    variant="secondary"
                    className="gap-1.5 pl-2.5 pr-1.5 py-1 text-xs"
                  >
                    <span>{opt}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(optIdx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 max-w-sm">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                  placeholder="New option name..."
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  className="h-8 text-xs"
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Special Type Config: LIST or GROUP (Nested `of` fields) */}
          {(field.type === "list" || field.type === "group") && (
            <div className="rounded-md border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    {field.type === "list" ? "List Item Schema" : "Group Fields"}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Define the structured fields for this {field.type}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubfield}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Sub-field
                </Button>
              </div>

              {(!field.of || field.of.length === 0) ? (
                <div className="p-4 text-center border border-dashed rounded text-xs text-muted-foreground">
                  No sub-fields defined. Add at least one sub-field for this {field.type}.
                </div>
              ) : (
                <div className="space-y-2">
                  {field.of.map((sub, subIdx) => (
                    <div
                      key={sub.name + subIdx}
                      className="rounded border bg-background p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                          <Input
                            value={sub.label || ""}
                            onChange={(e) => {
                              const newLabel = e.target.value;
                              const shouldUpdateName = !sub.name || sub.name === toSnakeCase(sub.label || "");
                              handleUpdateSubfield(subIdx, {
                                ...sub,
                                label: newLabel,
                                name: shouldUpdateName ? toSnakeCase(newLabel) : sub.name,
                              });
                            }}
                            placeholder="Label (e.g. Role)"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={sub.name}
                            onChange={(e) =>
                              handleUpdateSubfield(subIdx, {
                                ...sub,
                                name: toSnakeCase(e.target.value),
                              })
                            }
                            placeholder="Key (e.g. role)"
                            className="h-8 text-xs font-mono"
                          />
                          <Select
                            value={sub.type}
                            onValueChange={(val) =>
                              handleUpdateSubfield(subIdx, {
                                ...sub,
                                type: val as FieldType,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_FIELD_TYPES.filter(
                                (t) => t.type !== "list" && t.type !== "group"
                              ).map((t) => (
                                <SelectItem key={t.type} value={t.type}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={subIdx === 0}
                            onClick={() => handleMoveSubfield(subIdx, "up")}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={subIdx === (field.of?.length || 1) - 1}
                            onClick={() => handleMoveSubfield(subIdx, "down")}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSubfield(subIdx)}
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Content Type Editor Main Form Component
// -------------------------------------------------------------
interface ContentTypeEditorProps {
  initialData?: ContentType;
  isEdit?: boolean;
}

export function ContentTypeEditor({ initialData, isEdit = false }: ContentTypeEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  // Form State
  const [name, setName] = useState(initialData?.name || "");
  const [key, setKey] = useState(initialData?.key || "");
  const [isSingleton, setIsSingleton] = useState(initialData?.is_singleton || false);
  const [fields, setFields] = useState<Field[]>(initialData?.fields || []);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder" | "json">("builder");

  // dnd-kit sensors
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

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit && (!key || key === toSnakeCase(name))) {
      setKey(toSnakeCase(val));
    }
  };

  const handleAddField = () => {
    const newField: Field = {
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      type: "text",
      required: false,
    };
    setFields([...fields, newField]);
  };

  const handleUpdateField = (index: number, updated: Field) => {
    const next = [...fields];
    next[index] = updated;
    setFields(next);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleMoveField = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setFields(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((_, i) => `field-${i}` === active.id);
      const newIndex = fields.findIndex((_, i) => `field-${i}` === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setFields(arrayMove(fields, oldIndex, newIndex));
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for the content type");
      return;
    }

    if (!key.trim()) {
      toast.error("Please enter a key identifier for the content type");
      return;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      toast.error(
        "Key must start with a lowercase letter and contain only lowercase alphanumeric characters and underscores"
      );
      return;
    }

    // Validate fields
    const seenNames = new Set<string>();
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f.name || !/^[a-z][a-z0-9_]*$/.test(f.name)) {
        toast.error(`Field #${i + 1} has an invalid key '${f.name}'. Must be snake_case.`);
        return;
      }
      if (seenNames.has(f.name)) {
        toast.error(`Duplicate field key '${f.name}'. Field keys must be unique.`);
        return;
      }
      seenNames.add(f.name);

      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        toast.error(`Field '${f.name}' is a select field but has no options configured.`);
        return;
      }

      if ((f.type === "list" || f.type === "group") && (!f.of || f.of.length === 0)) {
        toast.error(`Field '${f.name}' has no sub-fields defined.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      if (isEdit) {
        await api.updateContentType(key, {
          name,
          is_singleton: isSingleton,
          fields,
        });
        toast.success(`Content type '${name}' updated successfully`);
      } else {
        await api.createContentType({
          key,
          name,
          is_singleton: isSingleton,
          fields,
        });
        toast.success(`Content type '${name}' created successfully`);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["contentTypes"] });
      queryClient.invalidateQueries({ queryKey: ["contentTypes", key] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });

      router.push("/dashboard/content-types");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save content type";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Preview object
  const schemaPreview = {
    key,
    name,
    is_singleton: isSingleton,
    fields,
  };

  if (!isUserLoading && !isAdmin) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center max-w-lg mx-auto my-12">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only administrators have permission to create or modify content types and schemas.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Link href="/dashboard/content-types">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isEdit ? `Edit Schema: ${initialData?.name || key}` : "New Content Type"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Update fields and display options for this content type."
                : "Define the schema and fields for a new content collection."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/content-types">Cancel</Link>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Update Schema" : "Create Type"}
          </Button>
        </div>
      </div>

      {/* Main Tabs: Builder vs Live JSON */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "builder" | "json")}>
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList className="grid w-64 grid-cols-2">
            <TabsTrigger value="builder" className="gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Visual Builder
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5 text-xs">
              <Code2 className="w-3.5 h-3.5" />
              Live JSON Schema
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground">
            {fields.length} {fields.length === 1 ? "field" : "fields"} configured
          </span>
        </div>

        {/* Tab 1: Builder */}
        <TabsContent value="builder" className="space-y-6 pt-4">
          {/* General Metadata Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Information</CardTitle>
              <CardDescription>
                Basic naming and structure settings for this content model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Schedule Sessions"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Human-readable label shown in navigation and headers.
                  </p>
                </div>

                {/* Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-foreground block">
                      Type Key <span className="text-destructive">*</span>
                    </label>
                    {isEdit && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    )}
                  </div>
                  <Input
                    value={key}
                    disabled={isEdit}
                    onChange={(e) => setKey(toSnakeCase(e.target.value))}
                    placeholder="e.g. schedule_sessions"
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Unique identifier used in API URLs and snapshot JSON.
                  </p>
                </div>
              </div>

              {/* Singleton Toggle */}
              <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/20">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-foreground">Singleton Content Type</div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, this content type contains only one single entry (e.g. Site Settings, Homepage Hero).
                  </p>
                </div>
                <Switch
                  checked={isSingleton}
                  onCheckedChange={setIsSingleton}
                />
              </div>
            </CardContent>
          </Card>

          {/* Fields Builder Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Fields Configuration</CardTitle>
                <CardDescription>
                  Drag and drop to reorder fields, configure data types, and define validation rules.
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={handleAddField}
                size="sm"
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Field
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {fields.length === 0 ? (
                <div className="p-8 text-center border border-dashed rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    No fields configured yet. Click &quot;Add Field&quot; to begin building your schema.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddField}
                    className="mt-3 gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Field
                  </Button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={fields.map((_, i) => `field-${i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {fields.map((field, idx) => (
                        <SortableFieldItem
                          key={`field-${idx}`}
                          id={`field-${idx}`}
                          field={field}
                          index={idx}
                          total={fields.length}
                          onUpdate={(updated) => handleUpdateField(idx, updated)}
                          onRemove={() => handleRemoveField(idx)}
                          onMoveUp={() => handleMoveField(idx, "up")}
                          onMoveDown={() => handleMoveField(idx, "down")}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Live JSON Schema Preview */}
        <TabsContent value="json" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Live Schema Definition</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {key || "untitled"}.json
                </Badge>
              </CardTitle>
              <CardDescription>
                This exact JSON payload will be stored and used to generate dynamic forms and snapshot exports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/60 p-4 rounded-lg overflow-x-auto font-mono text-foreground border leading-relaxed">
                {JSON.stringify(schemaPreview, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
