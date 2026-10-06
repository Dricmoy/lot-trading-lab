# Replay attempt comparison

## Design

Keep Lot's forest #172b20, ivory #f6f8f3, lime #c9f17e and rule #dce4d6. Use emerald #236b49 for attempt A and blue #4767a4 for B, with letters and solid/dashed chart lines so color is not the sole distinction. Manrope carries titles and decisions; DM Sans carries notes and controls. Left-align content. The decision tree is the focal element; surrounding controls and measurements stay quiet.

```
Same scenario, independent $100k
            |
     shared saved choices
            |
       first difference
        /          \
  Attempt A     Attempt B
    choice        choice
      |             |
    ending        ending
```

Use real saved event order and revealed clocks. Nodes open an inspection with before/after value, the original plan, immediate fill state, all eventual fills and the saved reflection. Shared choices inspect both plans. Mobile retains two readable branches and stacks selection/inspection controls. Native dialogs, keyboard buttons, table values and reduced motion support access without graph gestures.

## Data and limits

`GET /api/replay/compare?first=<uuid>&second=<uuid>` resolves the same account as the existing private replay routes. It accepts two distinct, finished, owned sessions on the same scenario/version. Sharing tokens cannot expose comparison or private notes. The response is private/no-store. No new tables or migrations are required.

The server folds saved events using the existing deterministic execution implementation and validates event fingerprints, revision sequence and final state. The shared trunk matches order timing/terms/quantity or the cancelled order's sequence; reasons/reflections do not determine structural equality. Waiting and automatic fills are not invented decisions. A tree describes actual paths, not generated hypothetical outcomes or individual causal attribution.

The chart/table use the last moment both attempts experienced. At each moment the final recorded valuation includes every action at that clock. If one advance crossed the cutoff, a bounded partial advance reconstructs that exact clock before later decisions. Branch endings retain each attempt's actual end time. Different friction settings are explicitly disclosed. Only already revealed prices are used; comparisons require completion to preserve the learning flow.

Saved-session metadata includes scenario version and friction so selection can filter compatible peers. Up to 200 saved sessions and the existing 100-order/1,000-event quotas bound work. Nodes initially show six decisions per branch and the latest three shared choices; earlier choices can be expanded. Reload preserves selection in the URL. Request cancellation prevents superseded selections from appearing.

Visitors can explore a labelled example at `/replay/compare?example=1`. The public `/api/replay/compare/example` builds two authored synthetic scripts entirely in memory using the same execution/event reconstruction functions. It reads no accounts or saved journal notes and writes no sessions. The interface calls these scripted choices rather than user activity, and example branch endings have no links to private recaps.

## Delivery observations

October 6, 2026: frontend production build passed (2,179 modules), frontend lint passed, Ruff passed for changed backend files, and the diff whitespace check passed. No new automated tests were added for this feature.

The actual local app was used to retry an existing disposable QA attempt, make the same opening 50-share purchase, then sell 20 shares, place/cancel a ten-share resting limit and finish at moment 13. Its comparison with the earlier moment-21 ending reconstructed the shared purchase and distinct branches. The common-clock table showed $100,033.48 versus $100,056.49 at 10:49; the later attempt's own final $100,007.49 remained separately labelled. This exercised a cutoff inside the earlier attempt's multi-moment advance. Shared-node inspection displayed both different written plans and matching opening accounting.

The actual app inside a 390 × 844 iframe showed equal client/scroll widths of 375 pixels (excluding its scrollbar). Native decision inspection stacked the two attempts and remained readable. This observes responsive CSS in the desktop browser, not physical mobile browser behavior. The scripted full-day example displayed its authored branching choices and computed outcomes. Source `3aacafe7ea4875d8c65ed3b906fc57046eee4326` deployed as `dpl_EAtHwPGbFnULjZADTrErKjWvx9F6`, reported READY and assigned https://lot-trading-lab.vercel.app. The public example and decision inspection were observed on that alias. Inspecting the 11:36 resting buy showed zero immediate fills and a later 11:42 fill of 50 shares at $100.37, $1.01 fee, with final filled status. The displayed full-day example results were $97,636.15 and $100,019.57, a $2,383.42 difference. Those are simulation outputs of the authored scripts, not human trading evidence. No schema migration was required. Live screenshot: `screenshots/comparison-tree-live.png`.
