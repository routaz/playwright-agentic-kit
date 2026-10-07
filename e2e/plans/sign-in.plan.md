# Sign-in test plan

Context: e2e/context/sign-in.feature.yaml (risk: high)

## Coverage

| Context item             | Covered by                                                                   | Action                            |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------- |
| rule `generic-error`     | sign-in.spec.ts › "rejects a wrong password without revealing which field…"  | planned: 1.1 (unknown email half) |
| rule `private-pages`     | sign-in.spec.ts › "sends signed-out visitors to the login page"              | none                              |
| rule `server-sign-out`   | – (sign-in.spec.ts › "signing out ends the session" only checks the UI)      | planned: 1.2                      |
| journey `sign-in`        | sign-in.spec.ts › "signs in with valid credentials and lands on the errand…" | none                              |
| journey `wrong-password` | sign-in.spec.ts › "rejects a wrong password without revealing which field…"  | none                              |
| journey `sign-out`       | sign-in.spec.ts › "signing out ends the session"                             | none                              |
| edge case `email-case`   | –                                                                            | planned: 1.3                      |
| edge case `empty-fields` | –                                                                            | planned: 1.4                      |
| known issues             | none listed                                                                  | –                                 |

## Findings

None.

## 1. sign-in

**Seed:** `e2e/seeds/signed-out.spec.ts`

### 1.1 gives the same generic error for an unknown email

**Covers:** `sign-in#generic-error`
**Given:** a signed-out visitor and an email with no account (e.g. `uniqueEmail`)
**Steps:**

1. Open /#/login (`LoginPage.goto`), fill textbox "Email" with the unregistered address, fill textbox "Password" with any value, click button "Sign in" (`LoginPage.signIn`).

**Expect:**

- The alert has exactly the text "Wrong email or password." (the same text as the wrong-password case)
- The URL still matches `/#\/login$/`

### 1.2 server rejects the old session cookie after signing out

**Seed:** `e2e/seeds/signed-in-empty.spec.ts`
**Covers:** `sign-in#server-sign-out`
**Given:** the `signedInPage` fixture
**Steps:**

1. Open the errand list (`ErrandsPage.goto`) and save the session cookie with `page.context().cookies()`.
2. Click button "Sign out" (the app sends `DELETE /api/session`, which returns 204) and wait for button "Sign in" to be visible.
3. Re-add the saved cookie with `context.addCookies` and call `page.request.get('/api/me')`.

**Expect:**

- `GET /api/me` with the replayed cookie returns 401

Note: the planner confirmed that `/api/me` returns 200 while signed in and 401 after sign-out, but could not replay the cookie itself. If this test fails, treat it as a possible app bug, not a test to loosen.

### 1.3 signs in when the email is typed in different capitalisation

**Covers:** `sign-in#edge:email-case`
**Given:** `user` from the user fixture
**Steps:**

1. `LoginPage.goto`, then `signIn(user.email.toUpperCase(), user.password)`.

**Expect:**

- Heading "Your errands" is visible
- Text "Signed in as <user.name>" is visible

### 1.4 blocks submission when fields are empty

**Covers:** `sign-in#edge:empty-fields`
**Given:** a signed-out visitor

**Steps:**

1. Open /#/login and click button "Sign in" with both textbox "Email" and textbox "Password" empty.

**Expect:**

- Textbox "Email" is focused (the browser's required-field validation stopped the submit)
- No `POST /api/session` request was sent
- No alert is visible and the URL still matches `/#\/login$/`

_Reviewer note: tightened. "No alert and still on /login" alone would also pass if the button did nothing._
