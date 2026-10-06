# Lot design system

The user selected the first displayed mockup and expanded the scope to a landing page, authentication, responsive layouts and working trading. The selected source is `exec-9562f48e-9adb-4544-a5c3-5640b5aae84e.png` in this chat's generated images.

Use the forest green sidebar, ivory workspace, pale lime selection and dark green actions. Manrope supplies display typography; DM Sans supplies interface text. Give the landing page one large typographic lead and an interactive product preview, with quieter supporting sections. The trading page uses a wide chart and a narrower order rail on desktop; mobile follows chart, order, watchlist, then supporting information. Authentication shares the same fonts, palette and form sizes. Values shown as prices are simulation data unless explicitly identified as private IEX prices.

Keep copy short, concrete and original to Lot. Do not put engineering stack information in product flows. Clearly explain virtual funds and simulated prices without repeating promotional slogans. Use visible keyboard focus, native dialogs, readable phone form inputs and reduced-motion behavior. `src/tokens.css` contains shared tokens; `src/product.css` applies them to the new product surfaces.

## Exports

The active CSS tokens are exported in `src/tokens.css`, imported from the product entry stylesheet. This is an existing React application; original trading styles remain in `src/style.css` while product styles define the selected visual system and responsive corrections.
