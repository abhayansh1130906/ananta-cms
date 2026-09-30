"use client";

import { useState } from "react";
import { ZodError } from "zod";
import { buildZodSchema } from "@/lib/content/buildZodSchema";
import { RichtextEditor } from "@/components/form/richtext-editor";
import { ImageField } from "@/components/form/image-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import type { Field, ImageValue } from "@/types/cms";

interface DynamicFormProps {
  fields: Field[];
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  loading?: boolean;
  submitLabel?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function DynamicForm({
  fields,
  initialData = {},
  onSubmit,
  loading = false,
  submitLabel = "Save Changes",
  onDirtyChange,
}: DynamicFormProps) {
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  const [formData, setFormData] = useState<Record<string, unknown>>(() => initialData || {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData || {});
  }

  const updateField = (path: string, value: unknown) => {
    if (onDirtyChange) onDirtyChange(true);

    setFormData((prev) => {
      const next = { ...prev };
      setNestedValue(next, path.split("."), value);
      return next;
    });

    // Clear error for this field
    if (errors[path]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate using runtime Zod schema
    const schema = buildZodSchema(fields);
    try {
      const validated = schema.parse(formData);
      setErrors({});
      onSubmit(validated);
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const newErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join(".");
          newErrors[path] = issue.message;
        }
        setErrors(newErrors);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          className="p-3 text-sm rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Please correct the errors indicated below before saving.</span>
        </div>
      )}

      <div className="space-y-6">
        {fields.map((field) => (
          <FormFieldItem
            key={field.name}
            field={field}
            path={field.name}
            value={getNestedValue(formData, field.name.split("."))}
            error={errors[field.name]}
            errors={errors}
            onChange={(val) => updateField(field.name, val)}
            onNestedChange={updateField}
            disabled={loading}
          />
        ))}
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={loading} size="lg">
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// Helpers for nested object paths
function getNestedValue(obj: Record<string, unknown> | null | undefined, pathParts: string[]): unknown {
  let curr: unknown = obj;
  for (const part of pathParts) {
    if (curr === null || curr === undefined || typeof curr !== "object") return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

function setNestedValue(obj: Record<string, unknown>, pathParts: string[], value: unknown): void {
  let curr: Record<string, unknown> = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const nextPart = pathParts[i + 1];
    const isNextIndex = /^\d+$/.test(nextPart);

    if (curr[part] === null || curr[part] === undefined) {
      curr[part] = isNextIndex ? [] : {};
    }
    curr = curr[part] as Record<string, unknown>;
  }
  const last = pathParts[pathParts.length - 1];
  curr[last] = value;
}

// Individual Form Field Renderer
function FormFieldItem({
  field,
  path,
  value,
  error,
  errors,
  onChange,
  onNestedChange,
  disabled,
}: {
  field: Field;
  path: string;
  value: unknown;
  error?: string;
  errors: Record<string, string>;
  onChange: (val: unknown) => void;
  onNestedChange: (path: string, val: unknown) => void;
  disabled: boolean;
}) {
  const label = field.label || field.name;
  const strVal = typeof value === "string" || typeof value === "number" ? String(value) : "";

  return (
    <div className="space-y-1.5">
      {/* Field Label & Required Asterisk */}
      {field.type !== "boolean" && (
        <label htmlFor={path} className="text-sm font-medium flex items-center gap-1">
          <span>{label}</span>
          {field.required && <span className="text-destructive">*</span>}
        </label>
      )}

      {/* Control depending on Field Type */}
      {(() => {
        switch (field.type) {
          case "text":
            return (
              <Input
                id={path}
                type="text"
                value={strVal}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}...`}
                disabled={disabled}
              />
            );

          case "richtext":
            return (
              <RichtextEditor
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
                disabled={disabled}
              />
            );

          case "number":
            return (
              <Input
                id={path}
                type="number"
                step="any"
                value={value !== null && value !== undefined && value !== "" ? Number(value) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange(val === "" ? null : Number(val));
                }}
                placeholder="0"
                disabled={disabled}
              />
            );

          case "date":
            return (
              <Input
                id={path}
                type="date"
                value={strVal}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
              />
            );

          case "time":
            return (
              <div className="space-y-1">
                <Input
                  id={path}
                  type="time"
                  value={strVal}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={disabled}
                />
                <span className="text-[11px] text-muted-foreground">Stored in 24h format (HH:mm)</span>
              </div>
            );

          case "datetime":
            return (
              <Input
                id={path}
                type="datetime-local"
                value={strVal}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
              />
            );

          case "boolean":
            return (
              <div className="flex items-center justify-between p-3 border rounded-xl bg-card">
                <div>
                  <label htmlFor={path} className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                    <span>{label}</span>
                    {field.required && <span className="text-destructive">*</span>}
                  </label>
                  <p className="text-xs text-muted-foreground">Toggle status</p>
                </div>
                <Switch
                  id={path}
                  checked={Boolean(value)}
                  onCheckedChange={onChange}
                  disabled={disabled}
                />
              </div>
            );

          case "url":
            return (
              <Input
                id={path}
                type="url"
                value={strVal}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://example.com"
                disabled={disabled}
              />
            );

          case "select":
            return (
              <Select value={strVal} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger id={path}>
                  <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );

          case "image":
            return (
              <ImageField
                value={value as ImageValue}
                onChange={onChange}
                disabled={disabled}
              />
            );

          case "group": {
            const groupVal = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
            return (
              <fieldset className="border rounded-xl p-4 bg-muted/10 space-y-4">
                <legend className="text-sm font-semibold px-2 text-foreground">
                  {label}
                </legend>
                {(field.of || []).map((subField) => {
                  const subPath = `${path}.${subField.name}`;
                  return (
                    <FormFieldItem
                      key={subField.name}
                      field={subField}
                      path={subPath}
                      value={groupVal[subField.name]}
                      error={errors[subPath]}
                      errors={errors}
                      onChange={(subVal) => onNestedChange(subPath, subVal)}
                      onNestedChange={onNestedChange}
                      disabled={disabled}
                    />
                  );
                })}
              </fieldset>
            );
          }

          case "list": {
            const items = Array.isArray(value) ? value : [];

            const addItem = () => {
              const emptyItem: Record<string, unknown> = {};
              for (const f of field.of || []) {
                emptyItem[f.name] = f.type === "boolean" ? false : "";
              }
              onChange([...items, emptyItem]);
            };

            const removeItem = (index: number) => {
              const next = [...items];
              next.splice(index, 1);
              onChange(next);
            };

            const moveItem = (index: number, direction: "up" | "down") => {
              if (
                (direction === "up" && index === 0) ||
                (direction === "down" && index === items.length - 1)
              ) {
                return;
              }
              const target = direction === "up" ? index - 1 : index + 1;
              const next = [...items];
              const temp = next[index];
              next[index] = next[target];
              next[target] = temp;
              onChange(next);
            };

            return (
              <div className="space-y-3">
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <Card key={idx} className="border shadow-2xs relative">
                      <CardContent className="p-3 pt-4 space-y-3">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveItem(idx, "up")}
                              disabled={disabled || idx === 0}
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveItem(idx, "down")}
                              disabled={disabled || idx === items.length - 1}
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              onClick={() => removeItem(idx)}
                              disabled={disabled}
                              title="Remove item"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(field.of || []).map((subField) => {
                            const subPath = `${path}.${idx}.${subField.name}`;
                            return (
                              <FormFieldItem
                                key={subField.name}
                                field={subField}
                                path={subPath}
                                value={item[subField.name]}
                                error={errors[subPath]}
                                errors={errors}
                                onChange={(subVal) => onNestedChange(subPath, subVal)}
                                onNestedChange={onNestedChange}
                                disabled={disabled}
                              />
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  disabled={disabled}
                  className="w-full gap-1 border-dashed"
                >
                  <Plus className="h-4 w-4" />
                  Add to {label}
                </Button>
              </div>
            );
          }

          default:
            return (
              <Input
                id={path}
                type="text"
                value={strVal}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
              />
            );
        }
      })()}

      {/* Inline error message */}
      {error && (
        <p className="text-xs text-destructive font-medium flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
