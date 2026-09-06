"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp, Plus, Split, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { MENU_ITEM, MENU_PANEL } from "@/components/ui/menu-styles";
import {
  MEET_GENDER_LABEL,
  type MeetEvent,
  type MeetEventGender,
} from "@/lib/meets";
import {
  DISTANCE_ORDER,
  STROKE_LABEL,
  STROKE_ORDER,
  eventLabel,
  isWhitelistedEvent,
  type Course,
  type Distance,
  type Stroke,
} from "@/lib/swim";
import {
  addCustomLine,
  addWhitelistLine,
  canMoveLine,
  eventFitsCourse,
  eventOptions,
  moveLine,
  removeLine,
  resolveLine,
  setLineGender,
  splitLine,
  unresolveLine,
  updateLine,
  type ProgrammeProblem,
} from "./programmeEditing";

/*
  Build and correct a meet's programme by hand.

  Importing a document is still the fast path for a real gala — this is for the
  meets that have no document, and for the corrections an import cannot make.
  Everything a line can be is editable here, including the source document's own
  words, because a programme is a fact about the MEET rather than about this
  app's whitelist: a relay or a 25 m sprint belongs on the list even though
  nobody can be timed against it.

  Invalid-for-course events are DISABLED, never hidden — "100 IM is short course
  only" is a fact the coach should be able to see, and a silently missing row
  reads as a bug in the app rather than a rule about swimming.
*/

const GENDERS: MeetEventGender[] = ["MIXED", "M", "F"];

export function ProgrammeEditor({
  lines,
  course,
  onChange,
  entryCounts,
  problem = null,
  focusLine = null,
  onFocused,
}: {
  lines: MeetEvent[];
  /** The meet's course, so impossible events can be shown as impossible. */
  course: Course | null;
  onChange: (lines: MeetEvent[]) => void;
  /**
   * Sign-ups per line id. `undefined` means NOT YET KNOWN, which is a different
   * fact from "nobody is entered" and is drawn differently: a coach must never
   * see an empty warning slot and read it as permission to delete.
   */
  entryCounts?: Map<string, number>;
  /** What is blocking the save, so the offending line can say so itself. */
  problem?: ProgrammeProblem | null;
  /** A line to scroll to and focus, set when the footer says "go to it". */
  focusLine?: number | null;
  onFocused?: () => void;
}) {
  const [announcement, setAnnouncement] = useState("");

  // Stable, so `memo` on the row below is not defeated by a fresh callback on
  // every keystroke — a sixty-line programme re-rendering per character is the
  // difference between typing and waiting.
  const apply = useCallback(
    (next: MeetEvent[], said: string) => {
      onChange(next);
      setAnnouncement(said);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-4">
      <AddEvent
        lines={lines}
        course={course}
        onChange={onChange}
        onAdded={(label) =>
          setAnnouncement(`${label} added. ${lines.length + 1} events.`)
        }
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-ink-muted">
          No events yet. Search above to add them, or close this and import a
          programme from the meet&rsquo;s own document.
        </p>
      ) : (
        /* One card of divided rows, not sixty stacked cards: at a real
           programme's length, sixty identical bordered panels give the one line
           that needs attention the same weight as the fifty-nine that do not. */
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs">
          {lines.map((line, i) => (
            <ProgrammeLine
              key={line.id ?? `${i}-${line.rawLabel}`}
              line={line}
              index={i}
              total={lines.length}
              course={course}
              entered={
                entryCounts === undefined
                  ? undefined
                  : line.id === undefined
                    ? 0
                    : (entryCounts.get(line.id) ?? 0)
              }
              problem={problem?.index === i ? problem.message : null}
              focusMe={focusLine === i}
              onFocused={onFocused}
              lines={lines}
              onChange={apply}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Search the whitelist and add an event, or add a line the whitelist has no
 * room for. An ARIA 1.2 combobox, matching `AccountCombobox`'s keyboard model.
 */
function AddEvent({
  lines,
  course,
  onChange,
  onAdded,
}: {
  lines: MeetEvent[];
  course: Course | null;
  onChange: (lines: MeetEvent[]) => void;
  onAdded: (label: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeRaw, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const listId = "programme-add-list";

  const options = useMemo(() => eventOptions(course, search), [course, search]);
  // Clamped at render rather than reset in an effect: filtering shortens the
  // list under the highlight, and a stored index would point past its end.
  const active = Math.min(activeRaw, Math.max(0, options.length - 1));

  // The list scrolls, so the highlighted option has to be brought into view:
  // otherwise arrowing down moves `aria-activedescendant` to a row a sighted
  // keyboard user cannot see.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Typing the name of a real event and pressing the free-text button beside it
  // would make a line that can never take a time. Say so instead.
  const exactMatch = options.find(
    (o) => o.allowed && o.label.toLowerCase() === search.trim().toLowerCase(),
  );

  function add(option: { distance: Distance; stroke: Stroke; label: string }) {
    onChange(addWhitelistLine(lines, option));
    onAdded(option.label);
    setSearch("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Opening is its own step: reopening after Escape must land on the first
      // option, not skip past it.
      if (!open) {
        setOpen(true);
        return;
      }
      // Arrows traverse EVERY option, disabled ones included: the reason a row
      // is disabled ("100 IM is short course only") is the whole point of
      // showing it, and skipping past it puts that reason out of reach of
      // anyone navigating by keyboard or screen reader.
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(options.length - 1, next));
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Only while the list is showing: after Escape, Enter belongs to the form.
      const option = options[active];
      if (open && option?.allowed) add(option);
      return;
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <label
          htmlFor="programme-add"
          className="text-sm font-medium text-gray-700"
        >
          Add an event
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id="programme-add"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && options[active] ? `programme-opt-${active}` : undefined
            }
            value={search}
            placeholder="100 free, 200 IM…"
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            className="h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-800 placeholder:text-gray-500 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring lg:h-9"
          />
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={search.trim() === "" || exactMatch !== undefined}
            aria-describedby={exactMatch ? "programme-add-hint" : undefined}
            onClick={() => {
              onChange(addCustomLine(lines, search));
              onAdded(search.trim());
              setSearch("");
              setOpen(false);
            }}
          >
            <Plus aria-hidden className="size-4" />
            Add as written
          </Button>
        </div>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Events"
            className={`${MENU_PANEL} stagger-menu absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto`}
          >
            {options.length === 0 && (
              <li
                role="presentation"
                className="px-2 py-1.5 text-sm text-ink-muted"
              >
                No event matches that. &ldquo;Add as written&rdquo; puts it on
                the programme anyway.
              </li>
            )}
            {options.map((option, index) => {
              return (
                <li
                  key={option.label}
                  ref={index === active ? activeRef : undefined}
                  id={`programme-opt-${index}`}
                  role="option"
                  aria-selected={index === active}
                  aria-disabled={!option.allowed}
                  className={
                    option.allowed
                      ? `${MENU_ITEM} justify-between ${index === active ? "bg-accent text-primary" : ""}`
                      : "flex cursor-not-allowed select-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-gray-500"
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (option.allowed) add(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span>{option.label}</span>
                  {option.reason && (
                    <span className="text-xs">{option.reason}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p id="programme-add-hint" className="text-xs text-ink-muted">
        {exactMatch
          ? `${exactMatch.label} is a real event, so add it from the list — a line typed by hand can never take a time.`
          : "Every event is Mixed unless you say otherwise. Split one into Boys and Girls with the split button on its row."}
      </p>
    </div>
  );
}

const ProgrammeLine = memo(function ProgrammeLine({
  line,
  index,
  total,
  course,
  entered,
  problem,
  focusMe,
  onFocused,
  lines,
  onChange,
}: {
  line: MeetEvent;
  index: number;
  total: number;
  course: Course | null;
  /** undefined = sign-ups not loaded yet, which is not the same as none. */
  entered: number | undefined;
  /** Why the save is blocked on THIS line, or null. */
  problem: string | null;
  focusMe: boolean;
  onFocused?: () => void;
  lines: MeetEvent[];
  onChange: (lines: MeetEvent[], said: string) => void;
}) {
  const resolved = line.distance !== undefined && line.stroke !== undefined;
  const rowRef = useRef<HTMLLIElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);

  // Sent here by the footer's "go to it": bring the line into view and put the
  // cursor in it, so the reason Save is grey becomes the thing you are editing.
  useEffect(() => {
    if (!focusMe) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    labelRef.current?.focus();
    onFocused?.();
  }, [focusMe, onFocused]);

  const name =
    line.rawLabel.trim() === "" ? `event ${index + 1}` : line.rawLabel;
  const problemId = `programme-line-${index}-problem`;

  return (
    <li
      ref={rowRef}
      className={
        // Never colour alone: the tint draws the eye, the sentence below says
        // what is wrong, and the field itself carries `aria-invalid` — which a
        // list item cannot, and which is where a screen reader will meet it.
        "p-3 " + (problem !== null ? "bg-error-50/50" : "")
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-20 shrink-0 flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">No.</span>
          <input
            inputMode="numeric"
            value={line.eventNumber ?? ""}
            aria-label={`No. for ${name}`}
            onChange={(e) => {
              // Anything that is not a number for an event is simply not typed,
              // rather than clearing the number the coach already had.
              const raw = e.target.value.trim();
              if (!/^\d{0,4}$/.test(raw)) return;
              onChange(
                updateLine(lines, index, {
                  eventNumber: raw === "" ? undefined : Number(raw),
                }),
                "",
              );
            }}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-base tabular-nums text-gray-800 outline-none focus:border-brand-300 focus:shadow-focus-ring lg:h-9"
          />
        </label>

        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            As the programme words it
          </span>
          <input
            ref={labelRef}
            value={line.rawLabel}
            maxLength={120}
            aria-label={`As the programme words it, event ${index + 1}`}
            aria-invalid={problem !== null ? true : undefined}
            aria-describedby={problem !== null ? problemId : undefined}
            onChange={(e) =>
              onChange(
                updateLine(lines, index, { rawLabel: e.target.value }),
                "",
              )
            }
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 outline-none focus:border-brand-300 focus:shadow-focus-ring lg:h-9"
          />
        </label>

        {/* One property with three exclusive values is a radio group, not three
            toggles: the shared control gives it a name, one tab stop and arrow
            keys, where hand-rolled aria-pressed buttons gave it none of those. */}
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            Who swims it
          </span>
          <Segmented
            ariaLabel={`Who swims ${name}`}
            value={line.gender ?? "MIXED"}
            onChange={(g) => onChange(setLineGender(lines, index, g), "")}
            options={GENDERS.map((g) => ({
              value: g,
              label: MEET_GENDER_LABEL[g],
            }))}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <EventPair
          line={line}
          course={course}
          onResolve={(event) => onChange(resolveLine(lines, index, event), "")}
          onClear={() => onChange(unresolveLine(lines, index), "")}
        />

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            ref={upRef}
            label={`Move ${name} earlier`}
            disabled={!canMoveLine(lines, index, -1)}
            onClick={() => {
              // The button about to be pressed disables itself at the top of
              // the list, so move focus before it leaves the tab order.
              if (index - 1 === 0) downRef.current?.focus();
              onChange(moveLine(lines, index, -1), `${name} moved earlier.`);
            }}
          >
            <ArrowUp aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            ref={downRef}
            label={`Move ${name} later`}
            disabled={!canMoveLine(lines, index, 1)}
            onClick={() => {
              if (index + 1 === total - 1) upRef.current?.focus();
              onChange(moveLine(lines, index, 1), `${name} moved later.`);
            }}
          >
            <ArrowDown aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label={`Split ${name} into Boys and Girls`}
            onClick={() =>
              onChange(
                splitLine(lines, index),
                `${name} split into two events.`,
              )
            }
          >
            <Split aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label={`Remove ${name}`}
            danger
            // Sign-ups are what makes removing this expensive, so the control
            // waits until it knows whether there are any.
            disabled={entered === undefined}
            onClick={() =>
              onChange(removeLine(lines, index), `${name} removed.`)
            }
          >
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>

      {problem !== null && (
        <p id={problemId} className="mt-2 text-xs font-medium text-danger-ink">
          {problem}
        </p>
      )}
      {!resolved && (
        <p className="mt-2 text-xs text-ink-muted">
          Not an event this app tracks, so it appears on the programme but
          nobody can be timed against it.
        </p>
      )}
      {entered === undefined ? (
        <p className="mt-2 text-xs text-ink-faint">Checking sign-ups…</p>
      ) : (
        entered > 0 && (
          <p className="mt-2 text-xs text-warning-ink">
            {entered === 1 ? "1 swimmer is" : `${entered} swimmers are`} signed
            up for this event. Removing it removes their sign-ups.
          </p>
        )
      )}
    </li>
  );
});

/**
 * Distance and stroke together, with impossible pairs disabled and never
 * hidden — the app-wide event-selector rule (§4.3), applied against all three
 * constraints rather than two: the whitelist, and the meet's own course.
 *
 * Leaving 100 IM pickable on a long-course meet would let a coach build a line
 * that the server refuses a time for, hours later, at the poolside.
 */
function EventPair({
  line,
  course,
  onResolve,
  onClear,
}: {
  line: MeetEvent;
  course: Course | null;
  onResolve: (event: { distance: Distance; stroke: Stroke }) => void;
  onClear: () => void;
}) {
  const distance = line.distance;
  const stroke = line.stroke;
  const name = line.rawLabel.trim() === "" ? "this event" : line.rawLabel;

  /** Could this pair be swum here at all? Whitelist first, then the pool. */
  const possible = (d: Distance, s: Stroke) =>
    isWhitelistedEvent(d, s) &&
    (course === null || eventFitsCourse(d, s, course));

  // An existing line can be invalid for the course (imported, or the course was
  // changed afterwards). It stays visible and marked rather than being quietly
  // cleared: what the document said is not ours to delete.
  const conflict =
    distance !== undefined &&
    stroke !== undefined &&
    course !== null &&
    !eventFitsCourse(distance, stroke, course)
      ? `${eventLabel(distance, stroke)} can't be swum in this meet's course. Change the event, or change the course on the Details tab.`
      : null;

  function pick(next: { distance?: Distance; stroke?: Stroke }) {
    const d = next.distance ?? distance;
    const s = next.stroke ?? stroke;
    if (d === undefined || s === undefined) return;
    onResolve({ distance: d, stroke: s });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        aria-label={`Distance for ${name}`}
        value={distance === undefined ? "" : String(distance)}
        onValueChange={(value) =>
          value === ""
            ? onClear()
            : pick({ distance: Number(value) as Distance })
        }
        size="sm"
        options={[
          { value: "", label: "Not a tracked event" },
          ...DISTANCE_ORDER.map((d) => ({
            value: String(d),
            label: `${d} m`,
            disabled: stroke === undefined ? false : !possible(d, stroke),
          })),
        ]}
      />
      <Select
        aria-label={`Stroke for ${name}`}
        value={stroke ?? ""}
        onValueChange={(value) =>
          value === "" ? onClear() : pick({ stroke: value as Stroke })
        }
        size="sm"
        options={[
          // The same words as the distance's own clear option: both do the same
          // thing, which is to stop the line claiming an event at all.
          { value: "", label: "Not a tracked event" },
          ...STROKE_ORDER.map((st) => ({
            value: st,
            label: STROKE_LABEL[st],
            disabled: distance === undefined ? false : !possible(distance, st),
          })),
        ]}
      />
      {distance !== undefined && stroke !== undefined && conflict === null && (
        <span className="text-xs text-ink-muted">
          {eventLabel(distance, stroke)}
        </span>
      )}
      {conflict !== null && (
        <span role="status" className="text-xs text-danger-ink">
          {conflict}
        </span>
      )}
    </div>
  );
}

const IconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    children: React.ReactNode;
  }
>(function IconButton({ label, onClick, disabled, danger, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex size-11 items-center justify-center rounded-lg transition-colors [transition-duration:var(--dur-1)] lg:size-9 " +
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
        "disabled:pointer-events-none disabled:opacity-40 " +
        (danger
          ? "text-gray-500 hover:bg-error-50 hover:text-error-500"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800")
      }
    >
      {children}
    </button>
  );
});
