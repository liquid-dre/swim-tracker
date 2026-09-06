"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
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
  moveWouldNumber,
  reorderBlockedReason,
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
/** Built once: a fresh array each render would defeat the row's memoization. */
const GENDER_OPTIONS = GENDERS.map((g) => ({
  value: g,
  label: MEET_GENDER_LABEL[g],
}));

/** The line-editing operations, made once so a memoized row stays memoized. */
type LineHandlers = {
  update: (i: number, patch: Partial<MeetEvent>) => void;
  gender: (i: number, g: MeetEventGender) => void;
  resolve: (i: number, event: { distance: Distance; stroke: Stroke }) => void;
  clear: (i: number) => void;
  move: (i: number, delta: -1 | 1, said: string) => void;
  split: (i: number, said: string) => void;
  remove: (i: number, said: string) => void;
};

export function ProgrammeEditor({
  lines,
  course,
  onChange,
  entryCounts,
  problems = [],
  mismatched = [],
  focusLine = null,
  onFocused,
}: {
  lines: MeetEvent[];
  /** The meet's course, so impossible events can be shown as impossible. */
  course: Course | null;
  /** A state setter, so an edit can be expressed as a function of the list. */
  onChange: Dispatch<SetStateAction<MeetEvent[]>>;
  /**
   * Sign-ups per line id. `undefined` means NOT YET KNOWN, which is a different
   * fact from "nobody is entered" and is drawn differently: a coach must never
   * see an empty warning slot and read it as permission to delete.
   */
  entryCounts?: Map<string, number>;
  /** Everything blocking the save, so every offending line can say so itself. */
  problems?: ReadonlyArray<ProgrammeProblem>;
  /** Lines whose event this meet's pool cannot run. Computed by the caller,
   *  which also shows the count on the Details tab where the course is set. */
  mismatched?: ReadonlyArray<number>;
  /** A line to scroll to and focus, set when the footer says "go to it". */
  focusLine?: number | null;
  onFocused?: () => void;
}) {
  const [announcement, setAnnouncement] = useState("");

  // The row below is memoized, which only pays off if its props are stable —
  // and passing the whole `lines` array plus a closure over it would rebuild
  // every prop on every keystroke, re-rendering sixty rows to change one. So
  // each edit is expressed as a FUNCTION of the current list, which needs
  // nothing from this render and can therefore be made once.
  const apply = useCallback(
    (edit: (lines: MeetEvent[]) => MeetEvent[], said: string) => {
      onChange((prev) => edit(prev));
      if (said !== "") setAnnouncement(said);
    },
    [onChange],
  );

  // Every problem on a line, so a row that is wrong twice says so twice.
  const problemsByLine = useMemo(() => {
    const out = new Map<number, string>();
    for (const p of problems) {
      if (p.index === null) continue;
      const already = out.get(p.index);
      out.set(
        p.index,
        already === undefined ? p.message : `${already} ${p.message}`,
      );
    }
    return out;
  }, [problems]);

  const reorderBlocked = reorderBlockedReason(lines);

  // A row that is about to unmount cannot hold focus, so the row that will take
  // its place is asked to. Merged with the caller's own focus request.
  const [focusAfter, setFocusAfter] = useState<number | null>(null);
  const focusTarget = focusLine ?? focusAfter;

  const clearFocusAfter = useCallback(() => setFocusAfter(null), []);
  // After a delete the neighbour takes focus: the row below, or the row above
  // when the last one goes.
  const rememberFocusAfterRemove = useCallback(
    (index: number, remaining: number) =>
      setFocusAfter(remaining === 0 ? null : Math.min(index, remaining - 1)),
    [],
  );

  const on = useMemo<LineHandlers>(
    () => ({
      update: (i, patch) => apply((ls) => updateLine(ls, i, patch), ""),
      gender: (i, g) => apply((ls) => setLineGender(ls, i, g), ""),
      resolve: (i, event) => apply((ls) => resolveLine(ls, i, event), ""),
      clear: (i) => apply((ls) => unresolveLine(ls, i), ""),
      move: (i, delta, said) => apply((ls) => moveLine(ls, i, delta), said),
      split: (i, said) => apply((ls) => splitLine(ls, i), said),
      remove: (i, said) => apply((ls) => removeLine(ls, i), said),
    }),
    [apply],
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

      {/* Facts about the LIST, above the list. Putting either inside row 0 —
          which an earlier pass did — attributes them to one event and hides
          them from a coach working at row 40. */}
      {mismatched.length > 0 && (
        <p className="text-xs text-warning-ink">
          {mismatched.length === 1
            ? "One event here can't be swum in this meet's course."
            : `${mismatched.length} events here can't be swum in this meet's course.`}{" "}
          They will save, but no time can be recorded against them until the
          event or the meet&rsquo;s course changes.
        </p>
      )}
      {reorderBlocked !== null && (
        <p className="text-xs text-warning-ink">{reorderBlocked}</p>
      )}
      {moveWouldNumber(lines) && (
        <p className="text-xs text-ink-muted">
          These events have no numbers. Moving one will number them all in their
          current order, because the number is what a meet&rsquo;s running order
          is.
        </p>
      )}

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
              key={line.id ?? String(i)}
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
              problem={problemsByLine.get(i) ?? null}
              mismatched={mismatched.includes(i)}
              focusMe={focusTarget === i}
              onFocused={onFocused}
              onFocusedLocal={clearFocusAfter}
              onRemoved={rememberFocusAfterRemove}
              canMoveUp={canMoveLine(lines, i, -1)}
              canMoveDown={canMoveLine(lines, i, 1)}
              on={on}
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
    (o) => o.label.toLowerCase() === search.trim().toLowerCase(),
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
      const next = e.key === "ArrowDown" ? active + 1 : active - 1;
      setActive(Math.max(0, Math.min(options.length - 1, next)));
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
            maxLength={120}
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
              <li className="px-2 py-1.5 text-sm text-ink-muted">
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
      {/* A live region, because the sentence changes underneath a button that
          is disabled and therefore cannot describe itself to a screen reader. */}
      <p role="status" className="text-xs text-ink-muted">
        {exactMatch
          ? exactMatch.allowed
            ? `${exactMatch.label} is a real event, so add it from the list — a line typed by hand can never take a time.`
            : `${exactMatch.reason} Change the meet's course, or add it as a different event.`
          : options.length === 0 && search.trim() !== ""
            ? "No event matches that. \u201cAdd as written\u201d puts it on the programme anyway, where it will show but take no times."
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
  mismatched,
  focusMe,
  onFocused,
  onFocusedLocal,
  onRemoved,
  canMoveUp,
  canMoveDown,
  on,
}: {
  line: MeetEvent;
  index: number;
  total: number;
  course: Course | null;
  /** undefined = sign-ups not loaded yet, which is not the same as none. */
  entered: number | undefined;
  /** Why the save is blocked on THIS line, or null. */
  problem: string | null;
  /** This line's event cannot be swum in the meet's course. */
  mismatched: boolean;
  focusMe: boolean;
  onFocused?: () => void;
  onFocusedLocal: () => void;
  onRemoved: (index: number, remaining: number) => void;
  /**
   * A numbered line cannot swap with an unnumbered one: the number decides the
   * running order and one of the pair has not got one, so the move would be
   * undone the moment the programme was read back.
   */
  canMoveUp: boolean;
  canMoveDown: boolean;
  on: LineHandlers;
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
    rowRef.current?.scrollIntoView({
      block: "center",
      // PRODUCT.md's reduced-motion rule applies to scrolling too; `Tabs` makes
      // the same check for the same reason.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    labelRef.current?.focus();
    onFocused?.();
    onFocusedLocal();
  }, [focusMe, onFocused, onFocusedLocal]);

  const name =
    line.rawLabel.trim() === "" ? `event ${index + 1}` : line.rawLabel;
  const problemId = `programme-line-${index}-problem`;

  return (
    <li
      ref={rowRef}
      className={
        // Never colour alone: the bar and tint draw the eye, the sentence
        // below says what is wrong, and the field itself carries `aria-invalid`
        // — which a list item cannot, and which is where a screen reader meets
        // it. The bar is shape as well as colour, so the row is still marked
        // where colour is not perceived.
        "p-3 " +
        (problem !== null
          ? "border-l-2 border-error-500 bg-error-50 pl-[calc(0.75rem-2px)]"
          : "")
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
              on.update(index, {
                eventNumber: raw === "" ? undefined : Number(raw),
              });
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
            onChange={(e) => on.update(index, { rawLabel: e.target.value })}
            className={
              // Hand-rolled rather than the shared `Input`, whose root takes no
              // className and so cannot flex inside this row. The error
              // treatment matches it exactly.
              "h-11 w-full rounded-lg border bg-white px-2 text-base text-gray-800 outline-none focus:border-brand-300 focus:shadow-focus-ring lg:h-9 " +
              (problem !== null
                ? "border-error-500 bg-error-50"
                : "border-gray-300 hover:border-gray-400")
            }
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
            onChange={(g) => on.gender(index, g)}
            options={GENDER_OPTIONS}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <EventPair
          line={line}
          course={course}
          onResolve={(event) => on.resolve(index, event)}
          onClear={() => on.clear(index)}
        />

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            ref={upRef}
            label={`Move ${name} earlier`}
            disabled={!canMoveUp}
            onClick={() => {
              // The button about to be pressed disables itself at the top of
              // the list, so move focus before it leaves the tab order.
              if (index - 1 === 0) downRef.current?.focus();
              // The POSITION, not just "moved": an identical announcement on a
              // second press is announced as nothing at all.
              on.move(index, -1, `${name} moved to ${index} of ${total}.`);
            }}
          >
            <ArrowUp aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            ref={downRef}
            label={`Move ${name} later`}
            disabled={!canMoveDown}
            onClick={() => {
              if (index + 1 === total - 1) upRef.current?.focus();
              on.move(index, 1, `${name} moved to ${index + 2} of ${total}.`);
            }}
          >
            <ArrowDown aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label={`Split ${name} into Boys and Girls`}
            onClick={() => on.split(index, `${name} split into two events.`)}
          >
            <Split aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label={`Remove ${name}`}
            danger
            // Sign-ups are what makes removing this expensive, so the control
            // waits until it knows whether there are any.
            disabled={entered === undefined}
            onClick={() => {
              // Focusing a sibling BUTTON here would be pointless: every one of
              // them is inside the row that is unmounting. The surviving
              // neighbour is asked for focus instead, through the same channel
              // the footer's "go to it" uses.
              on.remove(index, `${name} removed.`);
              onRemoved(index, total - 1);
            }}
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
      {mismatched && (
        <p className="mt-2 text-xs text-warning-ink">
          Not swum in this meet&rsquo;s course, so no time can be recorded
          against it.
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
      {/* Sized wrappers: a Select trigger is `w-full`, so dropped bare into a
          flex row each one would claim the whole line and wrap. */}
      <div className="w-40">
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
      </div>
      <div className="w-32">
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
              disabled:
                distance === undefined ? false : !possible(distance, st),
            })),
          ]}
        />
      </div>
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
