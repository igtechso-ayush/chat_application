import { Component } from 'react';
import PropTypes from 'prop-types';  // Import PropTypes

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state to display the fallback UI
        console.log(error)
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log the error to an error reporting service
        console.error("Error caught by ErrorBoundary:", error);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div>
                    <h2>Something went wrong.</h2>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}
ErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,  // Validate that children is a required prop of type node
};
export default ErrorBoundary;
