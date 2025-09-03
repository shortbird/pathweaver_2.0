import React from 'react'

class ModalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Modal Error:', error, errorInfo)
    // If the modal has an onClose prop, call it to close the modal
    if (this.props.onClose) {
      this.props.onClose()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Something went wrong</h3>
          <p className="text-red-600 text-sm">Unable to display this content. Please try again.</p>
          {this.props.onClose && (
            <button
              onClick={this.props.onClose}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Close
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ModalErrorBoundary