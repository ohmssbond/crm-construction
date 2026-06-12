# Enhancements backlog

Small feature enhancements surfaced from real-world dogfooding. Add new items at
the bottom with the next number — keep each short, enough to capture the intent.

**Status key:** 💡 idea · 🔨 building · ✅ shipped

---

## 1. Tasks should have owners ✅ shipped
  Completed: Jun 11, 2026
To-dos (tasks) should have an **owner**.

- **Default** the owner to the **person entering the task** (the team member creating it).
- Allow **changing** it to a **different contact associated with the project**.

_Open questions / notes:_
- To-dos are currently **internal-only** (never shown in the customer portal). Decide
  whether assigning a task to a *contact* should surface it to that contact in their
  portal, or whether "owner" stays a purely internal field.
- Owner can be a team member **or** a project contact → `todos` likely needs an owner
  reference (e.g. `owner_contact_id`, plus a way to denote "me/team").

## 2. Sign-in should have a generic branding.  Right now it is always defaulting to JH 💡

## 3. Owners can set their colors ✅ shipped
  Completed: Jun 11, 2026

## 4. New contact type - employee or team member.  This is an employee of the artisan who is not a partner or customer.  

## 5. Tasks/To-dos records: ✅ shipped
	 - display the date they were completed
         - public (can be seen all in project) or private (not just for the person making the "to-do")
         - change name from "to-dos" to "tasks"
   Completed: June 12th 2026
   New: add the consultant owner to the pull down list of people to assign tasks ✅ shipped
     Completed: Jun 12, 2026 — artisan replaces "Unassigned" as the first/default task owner option.

## 6. Photos & Files listed by type, ordered by date uploaded ✅ shipped
  Completed: Jun 12, 2026
  Group attachments into type sections (artisan + portal), ordered alphabetically
  by category label, newest upload first within each group.
