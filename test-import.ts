try {
  await import("./src/cli/index");
} catch (e) {
  console.error("FULL ERROR:", String(e));
  if (e instanceof Error) {
    console.error("MESSAGE:", e.message);
  }
}
