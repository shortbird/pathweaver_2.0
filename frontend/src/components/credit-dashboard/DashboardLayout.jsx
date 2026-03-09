import React from 'react'

const DashboardLayout = ({ children }) => {
  const [list, detail, context] = React.Children.toArray(children)

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-100 gap-3 p-3">
      {/* Left panel - item list */}
      <div className="w-[300px] min-w-[300px] overflow-y-auto bg-white rounded-lg shadow-sm">
        {list}
      </div>

      {/* Center panel - detail */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm">
        {detail}
      </div>

      {/* Right panel - student context */}
      {context && (
        <div className="w-[300px] min-w-[300px] overflow-y-auto bg-white rounded-lg shadow-sm">
          {context}
        </div>
      )}
    </div>
  )
}

export default DashboardLayout
