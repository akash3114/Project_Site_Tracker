"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/**
 * One row in a {@link Picker}. `group` decides where the row appears: adjacent
 * rows with the same group render under one heading, so callers keep related
 * rows next to each other instead of pre-grouping them.
 */
export type PickerOption = {
  value: string;
  /** Primary line, e.g. a designation ("Toll Manager | AP Plaza"). */
  label: string;
  /** Quiet right-aligned text, e.g. a count. */
  meta?: string;
  /** Secondary line for rich rows, e.g. a person's name. */
  detail?: string;
  /** Extra searchable text that is not displayed. */
  keywords?: string;
  group: string;
  /** Indentation for child rows (plazas under a project). */
  depth?: number;
  disabled?: boolean;
};

export type PickerProps = {
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Chips shown in the trigger before collapsing into `+N`. Default 2. */
  maxChips?: number;
  /** Unselected options are disabled once this many values are chosen. */
  maxSelected?: number;
  width?: "default" | "wide";
  renderTrigger?: (selected: PickerOption[]) => ReactNode;
  /**
   * Bulk actions rendered as a top action bar: directly under the search and
   * above the empty state / list, so they stay visible without scrolling.
   */
  footer?: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
};

type OptionGroup = {
  label: string;
  rows: { option: PickerOption; index: number }[];
};

function matchesQuery(option: PickerOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    option.label,
    option.meta ?? "",
    option.detail ?? "",
    option.group,
    option.keywords ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function groupRows(rows: PickerOption[]): OptionGroup[] {
  const groups: OptionGroup[] = [];
  rows.forEach((option, index) => {
    const current = groups[groups.length - 1];
    if (current && current.label === option.group) {
      current.rows.push({ option, index });
    } else {
      groups.push({ label: option.group, rows: [{ option, index }] });
    }
  });
  return groups;
}

/**
 * Accessible search-first picker used by the scope and assignee pickers.
 *
 * The trigger is a button, the search is a combobox that controls a listbox,
 * and every row is a `role="option"` button. Single-select closes on choose;
 * multi-select stays open so a batch of scopes is a batch of clicks.
 */
export function Picker({
  label,
  placeholder,
  options,
  value,
  onChange,
  multiple = false,
  disabled = false,
  searchPlaceholder,
  emptyText = "No matches.",
  maxChips = 2,
  maxSelected,
  width = "default",
  renderTrigger,
  footer,
  className,
  onOpenChange,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousOpen = useRef(false);
  const listId = useId();

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () =>
      value
        .map((entry) => options.find((option) => option.value === entry))
        .filter((option): option is PickerOption => Boolean(option)),
    [options, value],
  );

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );
  const filtered = useMemo(
    () => options.filter((option) => matchesQuery(option, tokens)),
    [options, tokens],
  );

  const capReached = maxSelected !== undefined && value.length >= maxSelected;
  const isDisabledOption = useCallback(
    (option: PickerOption) =>
      Boolean(option.disabled) || (capReached && !selectedSet.has(option.value)),
    [capReached, selectedSet],
  );

  // The active row must always be an enabled row, even after a filter or a
  // selection change removes the previously active option.
  const activeIndexResolved = useMemo(() => {
    if (filtered.length === 0) return -1;
    const start = Math.min(Math.max(activeIndex, 0), filtered.length - 1);
    for (let index = start; index < filtered.length; index += 1) {
      if (!isDisabledOption(filtered[index])) return index;
    }
    for (let index = start - 1; index >= 0; index -= 1) {
      if (!isDisabledOption(filtered[index])) return index;
    }
    return -1;
  }, [activeIndex, filtered, isDisabledOption]);

  const groups = useMemo(() => groupRows(filtered), [filtered]);

  // Notify the owner only on real transitions, never on mount.
  useEffect(() => {
    if (previousOpen.current === open) return;
    previousOpen.current = open;
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const closePicker = useCallback((focusTrigger = false) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openPicker = useCallback(() => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, [disabled]);

  // Focus the search as soon as the popover exists.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  // Close on any pointerdown outside the picker.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closePicker();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closePicker]);

  // A picker that becomes disabled while open must not keep a live popover.
  useEffect(() => {
    if (disabled && open) closePicker();
  }, [disabled, open, closePicker]);

  // Keep the active row visible while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndexResolved < 0) return;
    document
      .getElementById(`${listId}-option-${activeIndexResolved}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndexResolved, listId]);

  function moveActive(direction: 1 | -1) {
    if (filtered.length === 0) return;
    const from =
      activeIndexResolved < 0
        ? direction === 1
          ? -1
          : filtered.length
        : activeIndexResolved;
    for (
      let index = from + direction;
      index >= 0 && index < filtered.length;
      index += direction
    ) {
      if (!isDisabledOption(filtered[index])) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function jumpActive(toEnd: boolean) {
    const enabled = filtered
      .map((option, index) => (isDisabledOption(option) ? -1 : index))
      .filter((index) => index >= 0);
    if (enabled.length === 0) return;
    setActiveIndex(toEnd ? enabled[enabled.length - 1] : enabled[0]);
  }

  function chooseOption(option: PickerOption) {
    if (isDisabledOption(option)) return;

    if (multiple) {
      if (selectedSet.has(option.value)) {
        onChange(value.filter((entry) => entry !== option.value));
      } else if (!capReached) {
        onChange([...value, option.value]);
      }
      // Keep the caret in the search so keyboard toggling stays fluid.
      searchRef.current?.focus();
      return;
    }

    onChange([option.value]);
    closePicker(true);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        jumpActive(false);
        break;
      case "End":
        event.preventDefault();
        jumpActive(true);
        break;
      case " ":
        if (multiple) {
          event.preventDefault();
          const option = filtered[activeIndexResolved];
          if (option) chooseOption(option);
        }
        break;
      case "Enter": {
        // Never let Enter submit the surrounding form.
        event.preventDefault();
        if (multiple) {
          closePicker(true);
          break;
        }
        const option = filtered[activeIndexResolved];
        if (option) chooseOption(option);
        else closePicker(true);
        break;
      }
      case "Escape":
        event.preventDefault();
        closePicker(true);
        break;
      case "Tab":
        closePicker();
        break;
      default:
        break;
    }
  }

  function triggerContent() {
    if (renderTrigger) return renderTrigger(selectedOptions);
    if (selectedOptions.length === 0) {
      return <span className="picker-placeholder">{placeholder}</span>;
    }
    if (!multiple) {
      return (
        <span className="picker-trigger-text">{selectedOptions[0].label}</span>
      );
    }
    const shown = selectedOptions.slice(0, maxChips);
    const extra = selectedOptions.length - shown.length;
    return (
      <span className="picker-chips">
        {shown.map((option) => (
          <span key={option.value} className="picker-chip">
            {option.label}
          </span>
        ))}
        {extra > 0 ? (
          <span className="picker-chip picker-chip-more">+{extra}</span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      ref={rootRef}
      className={["picker", className ?? ""].filter(Boolean).join(" ")}
      data-open={open ? "true" : "false"}
      data-width={width}
      data-multiple={multiple ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        title={selectedOptions.map((option) => option.label).join(", ") || placeholder}
        onClick={() => (open ? closePicker() : openPicker())}
      >
        {triggerContent()}
        <span className="picker-caret" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open ? (
        <div className="picker-popover">
          <input
            ref={searchRef}
            className="picker-search"
            type="search"
            role="combobox"
            aria-label={`${label} search`}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              activeIndexResolved >= 0
                ? `${listId}-option-${activeIndexResolved}`
                : undefined
            }
            placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
          />

          {footer ? <div className="picker-footer">{footer}</div> : null}

          {filtered.length === 0 ? (
            <p className="picker-empty">{emptyText}</p>
          ) : (
            <div
              className="picker-list"
              id={listId}
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple}
            >
              {groups.map((group) => (
                <div
                  key={group.label}
                  className="picker-group"
                  role="group"
                  aria-label={group.label}
                >
                  <div className="picker-group-label" aria-hidden="true">
                    {group.label}
                  </div>
                  {group.rows.map(({ option, index }) => {
                    const selected = selectedSet.has(option.value);
                    return (
                      <button
                        key={`${option.group}:${option.value}`}
                        id={`${listId}-option-${index}`}
                        type="button"
                        className="picker-option"
                        role="option"
                        tabIndex={-1}
                        aria-selected={selected}
                        data-active={
                          index === activeIndexResolved ? "true" : "false"
                        }
                        data-selected={selected ? "true" : "false"}
                        data-depth={option.depth ?? 0}
                        disabled={isDisabledOption(option)}
                        style={{ paddingLeft: 8 + (option.depth ?? 0) * 16 }}
                        onMouseEnter={() => {
                          if (!isDisabledOption(option)) setActiveIndex(index);
                        }}
                        onClick={() => chooseOption(option)}
                      >
                        <span className="picker-check" aria-hidden="true">
                          {multiple ? "✓" : "•"}
                        </span>
                        <span className="picker-option-body">
                          <span className="picker-option-label">
                            {option.label}
                          </span>
                          {option.detail ? (
                            <span className="picker-option-detail">
                              {option.detail}
                            </span>
                          ) : null}
                        </span>
                        {option.meta ? (
                          <span className="picker-option-meta">
                            {option.meta}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
