"use client";

import {
  Fragment,
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
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Split,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { MENU_ITEM, MENU_PANEL } from "@/components/ui/menu-styles";
import {
  DAY_NOT_LISTED,
  MEET_GENDER_LABEL,
  daysAreContiguous,
  groupLineRunsByDay,
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
  countLinesByDay,
  eventFitsCourse,
  eventOptions,
  moveWouldNumber,
  reorderBlockedReason,
  shouldTeachCarryDown,
  moveLine,
  removeLine,
  resolveLine,
  setDayFrom,
  setLineDay,
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
  day: (i: number, day: number | undefined) => void;
  dayFrom: (
    i: number,
    day: number,
    dayName: string,
    below: number,
    overwrites: number,
  ) => void;
  resolve: (i: number, event: { distance: Distance; stroke: Stroke }) => void;
  clear: (i: number) => void;
  move: (i: number, delta: -1 | 1, said: string) => void;
  split: (i: number, said: string) => void;
  remove: (i: number, said: string) => void;
};

/** One day of the meet, as the per-line picker offers it. */
export type DayOption = { value: number; label: string };

/** One reversible carry-down: the list as it stood, and what it did. */
export type ProgrammeUndo = {
  lines: MeetEvent[];
  count: number;
  /** Named, because the visible text was weaker than the announcement. */
  dayName: string;
  /** The meet's span when it was taken; a changed span retires it. */
  forSpan: { startDate: string; endDate?: string | null };
};

/**
 * The single most urgent thing to say about the list, or nothing.
 *
 * Ranked by what a coach loses if it is NOT said, because suppressing four
 * messages is only a saving when what was hidden is said somewhere else or
 * matters less. Reordering being disabled leads: it kills both arrows on every
 * row and nothing else explains that. Then the numbering warning, the only
 * notice of an irreversible bulk renumber and stated nowhere else. The course
 * mismatch comes after both — it does not block, and the Details tab, the tab
 * label and each offending row all carry it too. Interleaved days are last of
 * the warnings: they change how the meet page will look, and nothing more.
 *
 * Pure, and exported, so the ranking this whole strip exists for is tested
 * rather than asserted in a comment.
 */
export function rankedNotice(state: {
  reorderBlocked: string | null;
  interleaved: boolean;
  mismatched: number;
  wouldNumber: boolean;
  teaching: boolean;
}): { text: string; tone: "warn" | "muted" } | null {
  if (state.reorderBlocked !== null) {
    return { tone: "warn", text: state.reorderBlocked };
  }
  // Second, because it is the only notice that warns a move will renumber all
  // sixty lines, and it is stated NOWHERE else. The mismatch below survives on
  // the Details tab, in the tab's own label and on each offending row, so it is
  // the one that loses least by being suppressed.
  if (state.wouldNumber) {
    return {
      tone: "muted",
      text: "These events have no numbers. Moving one will number them all in their current order, because the number is what a meet's running order is.",
    };
  }
  if (state.mismatched > 0) {
    return {
      tone: "warn",
      text:
        (state.mismatched === 1
          ? "One event here can't be swum in this meet's course."
          : `${state.mismatched} events here can't be swum in this meet's course.`) +
        " They will save, but no time can be recorded against them until the event or the meet's course changes.",
    };
  }
  if (state.interleaved) {
    return {
      tone: "warn",
      text: "A day appears more than once in this running order, so the bands below repeat. The meet page groups each day together, so it will not look like this until the events of a day sit together here.",
    };
  }
  if (state.teaching) {
    return {
      tone: "muted",
      text: "A programme runs in order, so give the first event of each day its day, then use “…and below” under that row's Day picker to put the rest of the list on it.",
    };
  }
  return null;
}

export function ProgrammeEditor({
  lines,
  course,
  dayOptions,
  dayDates,
  undo,
  setUndo,
  carriedDown,
  setCarriedDown,
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
  /**
   * The meet's days, in order. One day (or none) means no day control at all:
   * a single-day meet has nothing to choose, and offering the choice would
   * imply otherwise.
   *
   * Must be referentially stable — every row is memoized on it.
   */
  dayOptions: ReadonlyArray<DayOption>;
  /** The meet's dates, so the editor bands with the read view's own function. */
  dayDates: { startDate: string; endDate?: string | null };
  /**
   * The carry-down's one undo step, owned by the FORM rather than by this
   * component. `Tabs` renders `{active && content}`, so the editor unmounts the
   * moment a coach checks the course on Details — and the edits survive there
   * while the undo did not. A coach has no reason to expect one without the
   * other.
   */
  undo: ProgrammeUndo | null;
  setUndo: (undo: ProgrammeUndo | null) => void;
  /**
   * Has the coach USED the carry-down? Owned by the form for the same reason
   * `undo` is — `Tabs` unmounts this panel.
   *
   * Deliberately not derived from "some line has a day": the importer reads
   * days out of a document's own headings, so a re-imported three-day gala
   * arrives part-dayed, which is exactly the state the hint exists for. Derived
   * that way the hint vanished before the coach ever saw it, and "…and below"
   * only appears once a row HAS a day — so the one sentence naming the control
   * disappeared at the moment the control appeared.
   */
  carriedDown: boolean;
  setCarriedDown: (used: boolean) => void;
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
      // Any other edit retires the undo. Restoring a snapshot taken before an
      // event was added, re-worded or removed would silently throw that work
      // away — an "undo" that undoes more than it says is worse than none.
      setUndo(null);
      if (said !== "") setAnnouncement(said);
    },
    [onChange, setUndo],
  );

  // The current list, for the one handler that needs to read it without
  // becoming a new function on every keystroke — which would rebuild a prop on
  // all sixty memoized rows to change one character in a name field.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

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
  // One grouping rule, shared with the programme the coach will land on.
  // RUNS, not buckets: bucketing would lift a row out of its group the moment
  // its day was picked and drop it thirty positions up the screen, out from
  // under the finger that set it. See `groupLineRunsByDay`.
  const dayGroups = useMemo(
    () => groupLineRunsByDay(lines, dayDates),
    [lines, dayDates],
  );
  const interleaved =
    dayOptions.length > 1 && !daysAreContiguous(lines, dayDates);
  // Only meaningful on a multi-day meet; the tally below is gated on that.
  const tally = countLinesByDay(lines, dayOptions.length);

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

  /**
   * The single most urgent thing to say about the list, or nothing.
   *
   * Ranked rather than stacked: something that blocks an action outranks
   * something that will merely look different, which outranks teaching. Only
   * the top one shows, so the strip always has one meaning.
   */
  const notice = rankedNotice({
    reorderBlocked,
    interleaved,
    mismatched: mismatched.length,
    wouldNumber: moveWouldNumber(lines),
    teaching: shouldTeachCarryDown({
      dayCount: dayOptions.length,
      lineCount: lines.length,
      unplaced: tally.unplaced,
      carriedDown,
    }),
  });

  const on = useMemo<LineHandlers>(
    () => ({
      update: (i, patch) => apply((ls) => updateLine(ls, i, patch), ""),
      gender: (i, g) => apply((ls) => setLineGender(ls, i, g), ""),
      // Said, not silent: this is the one field edit whose consequence is a
      // band moving somewhere else in the list, and the tally that used to
      // announce it is now plain text.
      day: (i, d) =>
        apply(
          (ls) => setLineDay(ls, i, d),
          // The picker's own words, not a third spelling of a day.
          d === undefined
            ? "Day cleared."
            : `Moved to ${dayOptions[d - 1]?.label ?? `day ${d}`}.`,
        ),
      // The one edit here that rewrites the whole list below the cursor, so
      // the one that keeps an undo. Used out of order — Day 1 from row 0 after
      // the Sunday and Monday were already placed — it collapses a full
      // assignment pass, and the only other escape is discarding every edit in
      // the sheet. A picker announces its own new value; "36 events moved"
      // is a fact no control reports, so this one says it.
      dayFrom: (i, d, dayName, below, overwrites) => {
        // The snapshot is taken OUTSIDE the updater. A state updater has to be
        // pure — React calls it twice under StrictMode — so a `setUndo` inside
        // it would record the snapshot twice and, on the second call, record
        // the already-written list as the thing to go back to.
        setCarriedDown(true);
        setUndo({
          lines: linesRef.current,
          count: below + 1,
          dayName,
          forSpan: dayDates,
        });
        onChange((prev) => setDayFrom(prev, i, d));
        setAnnouncement(
          `${below + 1} events moved to ${dayName}.${
            overwrites > 0 ? ` ${overwrites} were on another day.` : ""
          } Undo is available.`,
        );
      },
      resolve: (i, event) => apply((ls) => resolveLine(ls, i, event), ""),
      clear: (i) => apply((ls) => unresolveLine(ls, i), ""),
      move: (i, delta, said) => apply((ls) => moveLine(ls, i, delta), said),
      split: (i, said) => apply((ls) => splitLine(ls, i), said),
      remove: (i, said) => apply((ls) => removeLine(ls, i), said),
    }),
    [apply, onChange, setUndo, setCarriedDown, dayDates, dayOptions],
  );

  return (
    <div className="flex flex-col gap-4">
      <AddEvent
        lines={lines}
        course={course}
        onChange={(next) => {
          setUndo(null);
          onChange(next);
        }}
        onAdded={(label) =>
          setAnnouncement(`${label} added. ${lines.length + 1} events.`)
        }
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/* One strip, not six stacked notices of equal weight: the tally is the
          standing state, and under it at most ONE message. */}
      {((dayOptions.length > 1 && lines.length > 0) ||
        notice !== null ||
        undo !== null) && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          {/* Plain text, not a second `role="status"`: the sr-only announcer
              above already speaks every change, and two regions firing on one
              carry-down talk over each other. */}
          {dayOptions.length > 1 && lines.length > 0 && (
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-muted">
              {/* A meet may run up to MAX_SPAN_DAYS; thirty-one counts above
                  row 1 is a wall, not a tally. Past a week it reports the days
                  that hold something. */}
              {tally.byDay
                .map((n, i) => ({ n, i }))
                .filter(({ n }) => tally.byDay.length <= 7 || n > 0)
                .map(({ n, i }) => (
                  <span key={i}>
                    {dayOptions[i].label}:{" "}
                    <span className="tabular-nums text-ink">{n}</span>
                  </span>
                ))}
              {tally.unplaced > 0 ? (
                <span>
                  {DAY_NOT_LISTED}:{" "}
                  <span className="tabular-nums text-warning-ink">
                    {tally.unplaced}
                  </span>
                </span>
              ) : (
                <span className="text-success-ink">Every event has a day.</span>
              )}
            </p>
          )}

          {/* BOTH, not either. The undo is an ACTION and the notice is a
              message; rendering one instead of the other meant an active undo
              suppressed `reorderBlocked` — the very message ranked first
              because nothing else on screen explains sixty dead arrows. */}
          {undo !== null && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span>
                <span className="tabular-nums text-ink">{undo.count}</span>{" "}
                events moved to {undo.dayName}.
              </span>
              <button
                type="button"
                onClick={() => {
                  const restore = undo.lines;
                  setUndo(null);
                  onChange(() => restore);
                  setAnnouncement(
                    "Those events are back on the days they were on.",
                  );
                }}
                className="inline-flex h-11 items-center rounded-lg px-2 font-medium text-brand-600 underline underline-offset-2 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 lg:h-8 touch:h-11"
              >
                Undo
              </button>
            </p>
          )}
          {notice !== null && (
            <p
              className={
                "text-xs " +
                (notice.tone === "warn" ? "text-warning-ink" : "text-ink-muted")
              }
            >
              {notice.text}
            </p>
          )}
        </div>
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
        /* Banded where the day CHANGES, in array order, so the list never
           reorders itself while the order is being stated. */
        <ul
          aria-label={`Programme, ${lines.length} ${lines.length === 1 ? "event" : "events"}`}
          className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs"
        >
          {dayGroups.map((group) => (
            <Fragment key={group.day ?? "unplaced"}>
              {group.label !== "" && (
                /* A real heading, so a screen-reader user can jump between the
                   days of a sixty-row programme instead of tabbing through
                   seven hundred controls in a line. */
                <li className="border-b border-gray-100 bg-gray-50 px-3 py-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal text-ink-muted">
                    <span className="tabular-nums">{group.indices.length}</span>{" "}
                    {group.indices.length === 1 ? "event" : "events"}
                  </span>
                  </h3>
                </li>
              )}
              {group.indices.map((i) => {
                const line = lines[i];
                return (
                  <ProgrammeLine
                    key={line.id ?? String(i)}
                    line={line}
                    index={i}
                    total={lines.length}
                    course={course}
                    dayOptions={dayOptions}
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
                    reorderReason={reorderBlocked}
                    below={lines.length - i - 1}
                    overwrites={
                      line.day === undefined
                        ? 0
                        : lines.filter(
                            (l, n) =>
                              n > i &&
                              l.day !== undefined &&
                              l.day !== line.day,
                          ).length
                    }
                    on={on}
                  />
                );
              })}
            </Fragment>
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
            className="h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-800 placeholder:text-gray-500 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring lg:h-9 touch:h-11"
          />
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-disabled={
              search.trim() === "" || exactMatch !== undefined || undefined
            }
            aria-describedby="programme-add-hint"
            onClick={() => {
              if (search.trim() === "" || exactMatch !== undefined) return;
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
                      ? `${MENU_ITEM} justify-between ${index === active ? "bg-accent text-brand-600" : ""}`
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
      {/* NOT a live region — it changes on every keystroke — but the sentence
          below is the only explanation of why "Add as written" goes dead, and a
          real `disabled` button is unfocusable and cannot describe itself. So
          the button is `aria-disabled` and points here instead. */}
      <p id="programme-add-hint" className="text-xs text-ink-muted">
        {exactMatch
          ? exactMatch.allowed
            ? `${exactMatch.label} is a real event, so add it from the list — a line typed by hand can never take a time.`
            : `${exactMatch.reason} Change the meet's course, or add it as a different event.`
          : search.trim() === ""
            ? "Type an event name to add a line the whitelist has no room for — a relay, a 25 m sprint."
            : options.length === 0
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
  dayOptions,
  entered,
  problem,
  mismatched,
  focusMe,
  onFocused,
  onFocusedLocal,
  onRemoved,
  canMoveUp,
  canMoveDown,
  reorderReason,
  below,
  overwrites,
  on,
}: {
  line: MeetEvent;
  index: number;
  total: number;
  course: Course | null;
  dayOptions: ReadonlyArray<DayOption>;
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
  /** Why reordering is off, when it is — so a dead arrow can say so itself. */
  reorderReason: string | null;
  /** How many lines follow this one — the reach of "and everything below". */
  below: number;
  /** How many of those are already on a DIFFERENT day, and would change. */
  overwrites: number;
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
  const dayName =
    line.day === undefined
      ? ""
      : (dayOptions[line.day - 1]?.label ?? `day ${line.day}`);
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
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-base tabular-nums text-gray-800 outline-none focus:border-brand-300 focus:shadow-focus-ring lg:h-9 touch:h-11"
          />
        </label>

        {/* Beside the number, because both answer "when is this swum" — the
            number is the order within a day, this is which day. Shown only on a
            multi-day meet; there is nothing to pick otherwise. */}
        {dayOptions.length > 1 && (
          <div className="flex w-32 shrink-0 flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Day</span>
            <Select
              aria-label={`Day for ${name}`}
              value={
                line.day !== undefined && line.day <= dayOptions.length
                  ? String(line.day)
                  : ""
              }
              onValueChange={(value) =>
                on.day(index, value === "" ? undefined : Number(value))
              }
              size="sm"
              options={[
                // The band's own constant, not a fourth literal: one state,
                // one name, wherever it is read.
                { value: "", label: DAY_NOT_LISTED },
                ...dayOptions.map((d) => ({
                  value: String(d.value),
                  label: d.label,
                })),
              ]}
            />
            {/* In words, beside the control it acts on, and only once the row
                HAS a day: a disabled version can only explain itself through a
                `title` an iPad never shows, and `--ink-faint` resolves to the
                same gray-500 as `--ink-muted`, so it would not even look
                disabled. */}
            {below > 0 && line.day !== undefined && (
              <button
                type="button"
                title={
                  overwrites > 0
                    ? `Puts ${name} and the ${below} events below it on ${dayName}, changing ${overwrites} already on another day.`
                    : `Puts ${name} and the ${below} events below it on ${dayName}.`
                }
                onClick={() =>
                  on.dayFrom(index, line.day!, dayName, below, overwrites)
                }
                className="inline-flex h-11 items-center self-start rounded-lg px-2 text-xs font-medium text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 lg:h-8 touch:h-11"
              >
                {overwrites > 0
                  ? `…and below (${overwrites} change day)`
                  : `…and below (${below})`}
              </button>
            )}
          </div>
        )}

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
              "h-11 w-full rounded-lg border bg-white px-2 text-base text-gray-800 outline-none focus:border-brand-300 focus:shadow-focus-ring lg:h-9 touch:h-11 " +
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
            reason={reorderReason}
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
            reason={reorderReason}
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

      {/* The blocking problem keeps its own line — it is the only one that
          stops a save, and what `aria-describedby` points at. The rest are one
          muted line rather than four stacked sentences of equal weight. */}
      {problem !== null && (
        <p id={problemId} className="mt-2 text-xs font-medium text-danger-ink">
          {problem}
        </p>
      )}
      {(mismatched || !resolved || entered === undefined || entered > 0) && (
        <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-ink-muted">
          {mismatched && (
            <span className="text-warning-ink">
              Not swum in this meet&rsquo;s course, so it can take no time.
            </span>
          )}
          {!resolved && (
            <span>Not an event this app tracks, so it can take no time.</span>
          )}
          {entered === undefined ? (
            <span>Checking sign-ups…</span>
          ) : (
            entered > 0 && (
              <span className="text-warning-ink">
                {entered === 1 ? "1 swimmer" : `${entered} swimmers`} signed up;
                removing it removes their sign-ups.
              </span>
            )
          )}
        </p>
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
      {/* Plain text, not a `role="status"` per row: switching the course fired
          one region per offending line at once, and the sentence that mattered
          was lost in the crawl. The strip above announces the count. */}
      {conflict !== null && (
        <span className="text-xs text-danger-ink">{conflict}</span>
      )}
    </div>
  );
}

const IconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    /** Why the button is disabled, when it is. Shown instead of the label. */
    reason?: string | null;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    children: React.ReactNode;
  }
>(function IconButton(
  { label, reason, onClick, disabled, danger, children },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={disabled && reason ? `${label} — ${reason}` : label}
      // The reason goes in the ACCESSIBLE NAME, not only the title: `title` is
      // a mouse affordance an iPad never shows, and a real `disabled` button is
      // unfocusable, so a keyboard or screen-reader user could never reach it
      // either. `aria-disabled` keeps it focusable; the handler no-ops.
      aria-label={disabled && reason ? `${label} — ${reason}` : label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={
        "inline-flex size-11 items-center justify-center rounded-lg transition-colors [transition-duration:var(--dur-1)] lg:size-9 touch:size-11 " +
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
        // A FILL carries inert, not ink. The ink stays gray-500 (4.97:1, so a
        // low-vision user can still read it) — but that is also the ENABLED
        // ink, so on a touch screen, which has no cursor and no hover, a dead
        // arrow was pixel-identical to a live one. On a sixty-row programme
        // with up to 120 dead arrows, which ones work became pure recall.
        // `bg-gray-100` is the same inert surface `Button` uses, so the app has
        // one vocabulary rather than one per component.
        "aria-disabled:bg-gray-100 aria-disabled:text-gray-500 aria-disabled:cursor-default " +
        "aria-disabled:hover:bg-gray-100 aria-disabled:hover:text-gray-500 " +
        (danger
          ? "text-gray-500 hover:bg-error-50 hover:text-error-500"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800")
      }
    >
      {children}
    </button>
  );
});
