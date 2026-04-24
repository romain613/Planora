import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo }); console.error("[ErrorBoundary] Error:", error); console.error("[ErrorBoundary] Stack:", errorInfo?.componentStack); console.error("[ErrorBoundary] Error message:", error?.message); }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      const errMsg = this.state.error?.message || String(this.state.error);
      const stack = this.state.errorInfo?.componentStack || "";
      return React.createElement("div", { style: { padding: 40, fontFamily: "monospace", background: "#FEF2F2", color: "#DC2626", minHeight: "100vh" } },
        React.createElement("h2", null, "⚠️ Erreur de rendu"),
        React.createElement("p", { style: { fontSize: 14, marginTop: 8, color: "#991B1B" } }, errMsg),
        React.createElement("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11, marginTop: 12, background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #FCA5A5", maxHeight: 400, overflow: "auto" } },
          "Message: " + errMsg + "\n\nComponent Stack:" + stack
        ),
        React.createElement("button", { onClick: () => { this.setState({ hasError: false }); window.location.reload(); }, style: { marginTop: 16, padding: "8px 16px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" } }, "Recharger")
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
