const feedbackEventName = "app-feedback";

export function emitAppFeedback(message: string) {
  window.dispatchEvent(
    new CustomEvent<{ message: string }>(feedbackEventName, {
      detail: { message },
    }),
  );
}

export function subscribeAppFeedback(listener: (message: string) => void) {
  const handleFeedback = (event: Event) => {
    const detail = (event as CustomEvent<{ message?: string }>).detail;
    if (detail?.message) {
      listener(detail.message);
    }
  };
  window.addEventListener(feedbackEventName, handleFeedback);
  return () => window.removeEventListener(feedbackEventName, handleFeedback);
}
