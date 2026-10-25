# Multi-Agent Development Protocol

## 1. Core Philosophy

The system follows a hierarchical structure:

**User → Orchestrator → Teammate → Subagent**

Higher-level agents focus on decisions, coordination, architecture, and delegation. Lower-level agents focus on execution.

### Principle 1 — Delegation Over Direct Execution

**The higher an agent is in the hierarchy, the less code it should write directly.**

- **Orchestrator:** Almost exclusively coordinates and makes architectural decisions.
- **Teammate:** Primarily manages its scope, delegates tasks, reviews code, and integrates changes.
- **Subagent:** Primarily implements, tests, and modifies code.

However, this is a preference, not an absolute restriction.

**Delegation must never become more expensive than execution itself.**

If a higher-level agent can safely make a trivial correction faster than describing it, delegating it, waiting for another agent, and reviewing the result, the agent should make the correction directly.

Examples include fixing an obvious typo, adjusting a single configuration value, or correcting a minor integration issue.

Direct intervention is appropriate when:

- The change is small, obvious, and low-risk.
- Delegation would introduce unnecessary overhead.
- The agent understands the affected code and its implications.
- The change does not conflict with another agent's ongoing work.
- Relevant checks can still be performed.

Direct intervention should not become an excuse for higher-level agents to routinely implement entire features.

**Optimize for overall team efficiency, not rigid adherence to roles.**

### Principle 2 — Continuous, Meaningful Commits

**Every meaningful completed unit of work should be committed.**

The repository must maintain a useful history of development rather than accumulating large, uncommitted changes.

Commit boundaries should follow logical milestones, not arbitrary time intervals or line counts.

Examples:

- A completed API endpoint.
- An implemented UI component.
- A completed refactoring stage.
- A resolved bug.
- A passing group of related tests.
- An integrated feature increment.

Avoid both extremes:

- One enormous commit containing an entire feature or multiple unrelated changes.
- Excessive microcommits for every trivial edit.

### Commit Responsibilities

**Subagents**
- Commit logically complete implementation increments.
- Keep commits focused on their assigned task.
- Run relevant checks before committing whenever practical.
- Provide commit references when reporting completed work.

**Teammates**
- Ensure subagent work is committed before integration.
- Review and integrate changes into the team branch.
- Create integration commits when appropriate.
- Commit each meaningful completed team milestone.
- Preserve intermediate progress instead of waiting for the entire team scope to finish.

**Orchestrator**
- Ensure that completed team milestones are integrated through a traceable process.
- Coordinate integration between team branches.
- Maintain a recoverable project history.
- Avoid directly rewriting or discarding another agent's commits.

**Commit frequency must reflect meaningful progress, not organizational hierarchy.**

## 2. Orchestrator — Project Lead

The Orchestrator owns project-wide planning and coordination.

Responsibilities:
- Interpret user requirements.
- Establish and maintain overall architecture.
- Divide the project into scopes.
- Assign scope ownership to teammates.
- Define and coordinate cross-team interfaces.
- Resolve architectural conflicts and dependencies.
- Monitor team progress.
- Coordinate integration and final verification.
- Reorganize teams when necessary.

The Orchestrator should not routinely write application code.

It may directly inspect, edit, or test code when doing so is clearly more efficient than delegation, provided it does not interfere with another agent's work.

The Orchestrator should delegate implementation tasks to teammates rather than directly managing their subagents.

## 3. Teammate — Team Lead

A Teammate owns one defined scope and leads its subagents.

Responsibilities:
- Plan implementation within the assigned scope.
- Break work into executable tasks.
- Assign and coordinate subagents.
- Make local design decisions consistent with the global architecture.
- Review implementation and test results.
- Manage team branches, commits, and integration.
- Coordinate dependencies with other teammates.
- Report significant progress, blockers, and architectural concerns.

Teammates should generally delegate substantial implementation work.

They may directly implement small fixes, resolve simple merge issues, or make minor adjustments when faster and safe.

A teammate is responsible for the quality of all work integrated into its team's branch, regardless of who wrote the code.

## 4. Subagent — Developer / Specialist

Subagents carry out concrete implementation or verification tasks.

Responsibilities:
- Implement assigned changes.
- Make routine local technical decisions.
- Follow approved requirements and architectural constraints.
- Write and execute relevant tests.
- Produce focused commits.
- Report changes, blockers, and proposed improvements.
- Escalate significant design decisions to their teammate.

Subagents may propose alternatives and identify architectural problems but must not silently override decisions made by higher-level agents.

## 5. Branches and Worktrees

Use isolated Git worktrees and branches for concurrent development.

Suggested structure:

- `main` — stable project state.
- `integration` — project-wide integration.
- `team/<scope>` — team integration branches.
- `agent/<team>/<task>` — individual task branches.

### Workflow

1. A teammate assigns a task to a subagent.
2. The subagent implements changes in an isolated branch.
3. The subagent creates commits at meaningful implementation milestones.
4. The teammate reviews and integrates the subagent's completed work.
5. The teammate commits meaningful team-level milestones.
6. Completed team increments are integrated into the project integration branch.
7. Integration and regression checks are performed.
8. Approved changes are promoted to the stable branch.

Teams do not need to wait until their entire scope is complete before committing or integrating independent, verified increments.

Never commit secrets, generated junk, or unrelated changes.

Never perform destructive Git operations on another agent's work without authorization.

## 6. Scope Ownership and Communication

Each team owns a clearly defined scope, including its components, interfaces, deliverables, and acceptance criteria.

Default communication paths:

- User ↔ Orchestrator
- Orchestrator ↔ Teammates
- Teammate ↔ Own Subagents
- Teammate ↔ Teammate

Cross-team subagent communication requires a concrete need and coordination through the relevant teammates.

Teammates may coordinate directly without involving the Orchestrator in every discussion.

Project-wide decisions remain under Orchestrator authority.

## 7. Verification and Quality Control

Verification is continuous, not a single final stage.

- Subagents verify their implementation before delivery.
- Teammates review and verify integrated subagent work.
- Dedicated QA agents may independently evaluate completed team increments.
- Final integration must be tested as a whole.

A team must not treat a passing local test as proof that the entire project is correct.

Defects should be reported to the owning team, corrected, committed, and reverified.

## 8. Dynamic Team Management

The Orchestrator creates only the teams required by the current work.

Teams may be created, expanded, reduced, reassigned, or disbanded as development progresses.

Subagents should be assigned only when their contribution is expected to outweigh delegation and coordination overhead.

Small tasks may be completed directly by an existing agent without creating additional agents or teams.

## 8a. Spawning Subagents, Model Selection, and Pushing

These are the defaults for every Teammate (team lead), including newly created ones.

- **Teammates create subagents, never teammates.** Only the Orchestrator creates teammates. Call the Agent tool **without the `name` parameter**; a named spawn creates a teammate. Subagents run in the background and report back to the agent that spawned them.
- **Teammates do not write implementation code.** They plan, define interfaces, write subagent briefs, review, and merge. Direct edits are limited to trivial fixes (see Principle 1).
- **Push after committing.** Subagents push their `agent/<team>/<task>` branch after each commit, and Teammates push `team/<scope>` after each milestone merge (`git push -u origin <branch>`). Only the Orchestrator pushes `integration` and `main`. Never force-push. The remote is public: never commit secrets or personal data.
- **Subagents use the `haiku` model by default.** When spawning a subagent, set `model: "haiku"`.
- **Use `sonnet` only for genuinely tough tasks.** Examples: subtle concurrency or lifecycle work, tricky algorithms, security-sensitive code, or a task where a `haiku` attempt has clearly failed.
- **Never use `opus` for subagents.**
- **Teammates themselves run on the session's default model** unless the user says otherwise.

Cheaper subagents need tighter briefs and closer review. Teammates must keep subagent tasks concrete and self-contained, and must verify typecheck and tests themselves before integrating.

## 9. Efficiency Rules

- Prefer delegation for substantial implementation work.
- Prefer direct execution for trivial, safe changes when faster.
- Parallelize independent tasks, not tightly coupled edits.
- Minimize unnecessary communication and status polling.
- Avoid redundant reviews that add no new verification.
- Maintain explicit scope ownership.
- Commit every meaningful completed development increment.
- Do not allow uncommitted changes to accumulate across milestones.
- Do not block independent work unnecessarily.
- Keep decisions as close to execution as practical.
- Escalate only when scope, authority, or architectural constraints are exceeded.

**The hierarchy is an optimization mechanism, not a bureaucracy.**

The Orchestrator manages the project.  
Teammates manage teams and scopes.  
Subagents execute the work.  

Any agent may perform a lower-level action when it is clearly the most efficient safe choice, but its primary responsibilities must remain unchanged.
