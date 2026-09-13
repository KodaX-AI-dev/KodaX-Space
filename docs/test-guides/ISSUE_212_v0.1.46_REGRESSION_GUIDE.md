# Issue 212: Pending-send elapsed time and phase wording

Baseline: Space `0.1.46-beta.1`. Fix: **Unreleased**, present in the working tree.

## Automated check

```powershell
node --test --import tsx apps/desktop/renderer/src/shell/ActivitySpinner.test.ts
```

The test invokes the actual store pending-send action, holds pending state, and advances a fake
clock. Repeated renders must show 5s, then 10s. After rejection and retry, a new three-second wait
must show 3s, not 13s. It restores the store snapshot after the test.

## Manual acceptance

1. In a rebuilt candidate, send the first message in a disposable Session. During a slow pending
   admission, watch the elapsed time increase across spinner updates.
2. Switch to another Session and back while admission is pending. Its timer should still measure
   from the original send action.
3. After a structured rejection, retry. The new attempt must have its own elapsed clock.
4. Check English and Chinese wording: pending preparation must not say the LLM is responsible
   when no model request has been established.
5. Verify ordinary streaming/tool phases continue to use their established activity timestamps.

This repair changes timing display and wording. It does not shorten Full RepoIntel work or fix
the SDK history timeout. Packaged-app acceptance remains separate from source/unit verification.
