# Friends and Quest Teams - Test Plan

This document outlines the test plan for the Friends and Quest Collaboration (Team-Up) features.

## 1. Prerequisites

- **Test Accounts:** At least three active user accounts are required to test the social interactions thoroughly. For this plan, we will refer to them as:
  - `User A`
  - `User B`
  - `User C`
- **Test Quest:** At least one active, multi-task quest should be available for collaboration testing.

---

## 2. Test Cases - Friend Management

This section covers the core functionality of adding, viewing, and managing friends.

**Test Case 2.1: Send Friend Request**
- **Description:** A user sends a friend request to another user via email.
- **Steps:**
  1. `User A` logs in.
  2. Navigate to the Friends page (`/friends`).
  3. In the "Send Friend Request" form, enter the email address of `User B`.
  4. Click "Send Request".
- **Expected Results:**
  - A success notification appears: "Friend request sent!".
  - The request should not appear in `User A`'s pending list.

**Test Case 2.2: Receive and Accept Friend Request**
- **Description:** A user receives and accepts a pending friend request.
- **Steps:**
  1. `User B` logs in.
  2. Navigate to the Friends page.
  3. Under "Friend Requests", a pending request from `User A` should be visible.
  4. Click the "Accept" button on the request from `User A`.
- **Expected Results:**
  - A success notification appears: "Friend request accepted!".
  - The pending request is removed from the list.
  - `User A` now appears in `User B`'s "My Friends" list.
  - Log in as `User A` and verify that `User B` also appears in `User A`'s "My Friends" list.

**Test Case 2.3: Receive and Decline Friend Request**
- **Description:** A user receives and declines a pending friend request.
- **Steps:**
  1. `User A` sends a friend request to `User C`.
  2. `User C` logs in and navigates to the Friends page.
  3. Under "Friend Requests", a pending request from `User A` should be visible.
  4. Click the "Decline" button on the request from `User A`.
- **Expected Results:**
  - A success notification appears: "Friend request declined".
  - The pending request is removed from the list.
  - `User A` does not appear in `User C`'s friend list.
  - `User A` should be able to send a new request to `User C` after the decline.

**Test Case 2.4: Remove a Friend**
- **Description:** A user removes an existing friend from their friend list.
- **Steps:**
  1. `User A` and `User B` are friends.
  2. `User A` logs in and navigates to the Friends page.
  3. Find `User B` in the "My Friends" list.
  4. Click the "Remove" or "..." button and select the remove option (Note: UI for this needs to be verified).
- **Expected Results:**
  - `User B` is removed from `User A`'s friend list.
  - Log in as `User B` and verify that `User A` is also removed from `User B`'s friend list.

---

## 3. Test Cases - Quest Collaboration (Teaming Up)

This section covers the functionality of inviting friends to collaborate on quests.

**Test Case 3.1: Send Team-Up Invitation**
- **Description:** A user invites a friend to an active quest.
- **Steps:**
  1. `User A` and `User B` are friends.
  2. `User A` starts a quest.
  3. On the quest detail page, locate the Collaboration Panel and click "Invite a Friend".
  4. From the `TeamUpModal`, find `User B` and click "Invite to Quest".
- **Expected Results:**
  - A success notification appears: "Invitation sent to User B!".
  - The button for `User B` in the modal should change to "Invited".
  - On the quest detail page, the `CollaborationPanel` should now show a "Team-Up Invitation Pending" status for `User A`.

**Test Case 3.2: Receive and Accept Team-Up Invitation**
- **Description:** A user receives and accepts a quest collaboration invitation.
- **Steps:**
  1. Following Test Case 3.1, `User B` logs in.
  2. Navigate to the Friends page.
  3. Under "Team-Up Invitations", a request from `User A` for the specific quest should be visible.
  4. Click "Accept".
- **Expected Results:**
  - A success notification appears.
  - The user is automatically navigated to the quest detail page.
  - The `CollaborationPanel` on the quest page should now show "Team-Up Active!" for both `User A` and `User B`.

**Test Case 3.3: Receive and Decline Team-Up Invitation**
- **Description:** A user receives and declines a quest collaboration invitation.
- **Steps:**
  1. `User A` invites `User C` (who is a friend) to a quest.
  2. `User C` logs in and navigates to the Friends page.
  3. Under "Team-Up Invitations", click "Decline".
- **Expected Results:**
  - A success notification appears.
  - The invitation is removed from `User C`'s list.
  - For `User A`, the `CollaborationPanel` on the quest page should revert to the default state, allowing another invitation to be sent.

**Test Case 3.4: Invite Multiple Friends to a Quest**
- **Description:** A user invites several friends to the same quest, and they all accept.
- **Steps:**
  1. `User A` is friends with `User B` and `User C`.
  2. `User A` starts a quest and invites both `User B` and `User C`.
  3. `User B` accepts the invitation.
  4. `User C` accepts the invitation.
- **Expected Results:**
  - The `CollaborationPanel` for all three users should show that they are in a team together.
  - The panel should correctly list the names of all collaborators.

---

## 4. Test Cases - Edge Cases and Error Handling

**Test Case 4.1:** Send friend request to a non-existent email.
- **Expected Result:** An error notification should appear: "User not found".

**Test Case 4.2:** Send friend request to self.
- **Expected Result:** An error notification should appear: "Cannot send friend request to yourself".

**Test Case 4.3:** Send a duplicate friend request to a user with a pending request.
- **Expected Result:** An error notification should appear: "Friend request already exists".

**Test Case 4.4:** Invite a non-friend to a quest.
- **Expected Result:** The user should not appear in the `TeamUpModal` list of friends to invite.

**Test Case 4.5:** Invite a friend who is already in a team-up on that same quest.
- **Expected Result:** An error notification should appear: "A pending invitation already exists for this quest" or "You already have an active collaboration for this quest".

---

## 5. Test Cases - XP Bonus Verification

**Test Case 5.1: Verify 2x XP on Task Completion**
- **Description:** Ensure that when two users are teamed up, they both receive double XP for task completions.
- **Steps:**
  1. `User A` and `User B` are teamed up on a quest.
  2. Note the current XP of both users.
  3. Let a task in the quest be worth `100 XP`.
  4. `User A` completes the task.
- **Expected Results:**
  - `User A`'s total XP should increase by `200 XP`.
  - `User B`'s total XP should also increase by `200 XP`.
  - (This test needs to be repeated with `User B` completing a task to ensure it works both ways).
