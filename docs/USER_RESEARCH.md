# Five-person Lot Replay study

Status: prepared; **no participant study has been conducted**. Automated verification workspaces are not people or product traction. Recruit five volunteers directly before drawing usability conclusions. Do not request brokerage balances, investment history, or other financial information.

## Session script (15–20 minutes each)

Tell the participant: “This is a fictional practice market with virtual money. We are observing whether the product is understandable. You can stop whenever you want.” Ask permission before recording their screen or voice; otherwise take anonymous notes.

1. Give the landing URL without instructions. Ask them to start practicing without signup. Observe whether Replay is discoverable and record time to the first session.
2. Ask them to choose a scenario, explain what information is available now, and describe what remains hidden. Do not point out the answer.
3. Ask them to buy a small position and write the reason they would use. Observe order review and whether fees, limits, and virtual funds are understood.
4. Ask them to place a limit that will wait, explain available cash, and cancel it. Observe whether reservations and remaining shares are clear.
5. Ask them to pause, advance, reload, and resume. Observe whether the clock, saved state, and fictional dispatches make sense.
6. Ask them to finish and explain return, holding comparison, drawdown, and fees in their own words. Record misunderstandings without correcting them until the end.
7. Ask them to write a reflection and share the recap while keeping that reflection private, then revoke the link.
8. Ask whether they would try another session and what question they would want the product to help them answer. Ask them to show the next action rather than only giving a rating.

## Evidence sheet

| Anonymous participant | Device | Start without help | First trade without help | Reservation understood | Recap understood | Notes privacy understood | Repeat session | Blocking issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Pending | | | | | | | |
| P2 | Pending | | | | | | | |
| P3 | Pending | | | | | | | |
| P4 | Pending | | | | | | | |
| P5 | Pending | | | | | | | |

Record observation timestamps, task time, and anonymous quotes only with permission. Separate observed behavior from your interpretation. Prioritize repeated blocking problems, change one flow, and repeat with fresh participants. Five sessions inform usability; they cannot establish investment outcomes or market demand.

## Product counters

Owner-only `POST /api/learning-metrics` counts saved replay starts, sessions with fills, finishes (full-day versus early), unique workspaces, and workspaces with repeat sessions. These are derived from authoritative persisted state rather than client clicks. They contain no journal text, account identifiers, email addresses, or tracking cookies beyond existing account identity. Counters include disposable verification sessions and remain **workspace counts**, not unique humans, time-based retention, or validated traction. A future study should record its own recruited cohort and dates.
