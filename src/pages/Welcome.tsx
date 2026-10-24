/** The first screen: shown once, on the first visit, then the app opens as usual. */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <img className="welcome-scene" src="/welcome.jpg" alt="" />
      <h1>YoomiRead</h1>
      <p>Read any world</p>
      <button type="button" onClick={onStart}>
        Start reading
      </button>
    </main>
  );
}
