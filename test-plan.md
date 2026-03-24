Plan formulated.
1. Backend: Update `runtime.service.ts` to output standard AG-UI events (like REASONING_MESSAGE_CONTENT, TOOL_CALL_START). Use `@ag-ui/encoder`.
2. Frontend: Install `@assistant-ui/react`, `@assistant-ui/react-ag-ui`, `@ag-ui/client`.
3. Update `ChatPanel.tsx` to use `<AssistantRuntimeProvider>` and `useAgUiRuntime`.
4. Replace custom SSE parsing in `api.ts` with `HttpAgent`.
5. Map existing traces to AG-UI standard message parts.

The plan clearly outlines the technical mapping between current custom trace events and AG-UI protocol events.
