# Errands test plan

_Planned by the e2e-planner agent (`npm run plan -- errands`), then reviewed. Reviewer changes are marked **[review]**._

## Application Overview

Context: e2e/context/errands.feature.yaml (risk: high). Coverage table and findings below, then planned scenarios. All scenarios go in e2e/specs/errands.spec.ts.

## Coverage

| Context item                 | Covered by                                                                       | Action                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| rule `private-lists`         | errands.spec.ts › "one user's errands are invisible to another"                  | none                                                                            |
| rule `no-blank-titles`       | errands.spec.ts › "a blank title adds nothing"                                   | none                                                                            |
| rule `remaining-counter`     | errands.spec.ts › empty list (0 plural), add (1 singular), complete (1 left)     | planned: 1.3 (plural for 2+, singular/plural transition on complete and delete) |
| rule `done-persists`         | errands.spec.ts › "completing an errand updates the count and survives a reload" | none                                                                            |
| journey `add-errand`         | errands.spec.ts › "adds an errand and counts it as remaining"                    | planned: 1.1 (unchecked and persists after reload)                              |
| journey `complete-errand`    | errands.spec.ts › completing an errand                                           | planned: 1.4 (unchecking negative path)                                         |
| journey `delete-errand`      | errands.spec.ts › "deletes an errand"                                            | planned: 1.5 (deleting one of two; deletion persists, counter updates)          |
| edge case `whitespace-title` | errands.spec.ts › "a blank title adds nothing"                                   | none                                                                            |
| edge case `long-title`       | –                                                                                | planned: 1.6                                                                    |
| edge case `html-title`       | –                                                                                | planned: 1.2                                                                    |
| edge case `two-users`        | errands.spec.ts › "one user's errands are invisible to another"                  | none                                                                            |
| out of scope: reordering     | –                                                                                | not planned: out of scope                                                       |

## Findings

1. Edge case `long-title`: the context gives no expected behaviour. In the app, a 320-character unbroken title (`LongWord` x40) is saved and listed, but the page overflows horizontally (documentElement scrollWidth 3131 vs clientWidth 1280), and the list item grows to about 3067px. The delete button is likely pushed far off-screen. I did not plan a layout assertion, because the intended behaviour isn't defined. Needs a human decision: add a rule (for example, wrap or truncate, or a maximum length) to the context, or accept the current behaviour. Scenario 1.6 only covers saving and deleting.

   **[review] Decided:** long titles must wrap. The context's `long-title` edge case now says so, the demo app's list labels got `overflow-wrap: anywhere` (checked at phone width: sideways overflow went from 2756px to 0, and the delete button is back on screen), and 1.6 now tests the unbroken case.

2. No other contradictions observed. HTML titles render as literal text, with no injected elements and no console errors beyond a favicon 404.

## 1. Errands

### 1.1 persists a newly added errand, unchecked, across reload

**Seed:** `e2e/seeds/signed-in-empty.spec.ts`
**Covers:** `errands#add-errand`
**Given:** `signedInPage` fixture, empty list
**Steps:**

1. Go to `/#/errands`, fill textbox "New errand" with "Return library books", click button "Add".
   **Expect:**
   - checkbox named "Return library books" is visible and not checked
   - textbox "New errand" has value ''
   - status reads "1 errand left"
2. Reload the page.
   **Expect:**
   - checkbox "Return library books" is still visible and not checked (the server saved it)
   - status reads "1 errand left"

### 1.2 renders a title containing HTML as plain text

**Seed:** `e2e/seeds/signed-in-empty.spec.ts`
**Covers:** `errands#edge:html-title`
**Given:** `signedInPage` fixture, empty list
**Steps:**

1. Add the title `<b>bold</b>` via `ErrandsPage.addErrand`.
   **Expect:**
   - `getByText('<b>bold</b>')` is visible, so the literal markup is shown
   - checkbox with name `<b>bold</b>` is visible
   - the list contains exactly one listitem
   - the item contains no `b` element: `expect(page.locator('li b')).toHaveCount(0)`. This is the one place a non-role locator is justified, because the check is for absent markup.
2. Reload the page.
   **Expect:**
   - the literal text is still displayed and the count is still 1 (the stored value is not interpreted)

### 1.3 uses singular and plural correctly in the remaining counter

**Seed:** `e2e/seeds/signed-in-with-errands.spec.ts`
**Covers:** `errands#remaining-counter`
**Given:** `data.userWithErrands(['Buy milk', 'Post parcel'])`, signed in with `as()`
**Steps:**

1. Go to `/#/errands`.
   **Expect:**
   - status reads "2 errands left"
2. Check "Buy milk".
   **Expect:**
   - status reads "1 errand left"
3. Check "Post parcel".
   **Expect:**
   - status reads "0 errands left"

### 1.4 unchecking an errand raises the counter and persists

**Seed:** `e2e/seeds/signed-in-with-errands.spec.ts`
**Covers:** `errands#done-persists`
**Given:** `data.userWithErrands(['Buy milk', 'Post parcel'])`
**Steps:**

1. Check "Buy milk".
   **Expect:**
   - status reads "1 errand left"
2. Uncheck "Buy milk".
   **Expect:**
   - status reads "2 errands left"
3. Reload.
   **Expect:**
   - checkbox "Buy milk" is not checked and status reads "2 errands left"

### 1.5 deleting one errand keeps the others, and the deletion persists

**Seed:** `e2e/seeds/signed-in-with-errands.spec.ts`
**Covers:** `errands#delete-errand`
**Given:** `data.userWithErrands(['Buy milk', 'Post parcel'])`
**Steps:**

1. Click button "Delete Buy milk".
   **Expect:**
   - the item "Buy milk" is gone
   - "Post parcel" is still visible
   - status reads "1 errand left"
   - the empty state is not visible
2. Reload.
   **Expect:**
   - "Buy milk" is still absent, "Post parcel" is present

### 1.6 a very long title without spaces wraps and stays usable **[review]** rewritten

**Seed:** `e2e/seeds/signed-in-empty.spec.ts`
**Covers:** `errands#edge:long-title`
**Given:** `signedInPage` fixture, empty list; the test sets a 375px-wide viewport itself, so it means the same in both projects
**Steps:**

1. Add a 320-character title with no spaces (`'LongWord'.repeat(40)`), and wait for the server's answer.

**Expect:**

- checkbox with the full title as its name is visible
- the page doesn't scroll sideways: `document.documentElement.scrollWidth` is at most `window.innerWidth`
- button "Delete <title>" is in the viewport

2. Reload, then delete it.

**Expect:**

- after the reload the full title is still there (stored, not truncated)
- after deleting, the empty state is visible
