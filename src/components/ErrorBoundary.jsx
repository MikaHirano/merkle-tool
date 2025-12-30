import { Component } from "react";
import { getErrorMessage } from "../lib/errorHandler.js";

/**
 * Error Boundary component
 * Catches React errors and displays a fallback UI
 * @class
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={errorBoundaryStyle}>
          <h2 style={{ marginTop: 0, color: "#ff6b6b" }}>Something went wrong</h2>
          <p style={{ marginBottom: 16 }}>
            {getErrorMessage(this.state.error)}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={resetButton}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const errorBoundaryStyle = {
  padding: "40px 20px",
  textAlign: "center",
  background: "rgba(255, 107, 107, 0.1)",
  border: "1px solid rgba(255, 107, 107, 0.3)",
  borderRadius: 12,
  margin: "20px auto",
  maxWidth: 600,
};

const resetButton = {
  padding: "10px 20px",
  borderRadius: 8,
  background: "#667eea",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};

