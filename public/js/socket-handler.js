// Create this file as public/js/socket-handler.js
(function () {
  // Create a single persistent socket connection
  const serverUrl =
    window.location.hostname === "localhost"
      ? window.location.origin
      : `http://${window.location.hostname}:${window.location.port}`;

  const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Make socket globally available
  window.appSocket = socket;

  // Track connection status
  socket.on("connect", () => {
    console.log("Connected to server socket");

    // Notify the server about the current page
    const currentPage = window.location.pathname;
    socket.emit("page_view", currentPage);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server socket");
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
  });

  // Add a listener for page navigation events
  document.addEventListener("DOMContentLoaded", () => {
    // Notify server of current page
    const currentPage = window.location.pathname;
    if (socket.connected) {
      socket.emit("page_view", currentPage);
    }

    // Add listeners for all internal links to track navigation
    document.querySelectorAll("a").forEach((link) => {
      // Only for internal links
      if (link.href.startsWith(window.location.origin)) {
        link.addEventListener("click", function () {
          const targetPath = new URL(this.href).pathname;
          socket.emit("page_view", targetPath);
        });
      }
    });
  });
})();
