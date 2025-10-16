import React from 'react'

const InvitationsEmptyState = ({ type = 'incoming' }) => {
  const isIncoming = type === 'incoming'

  return (
    <div className="text-center py-8">
      <p
        className="text-[#605C61]"
        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
      >
        {isIncoming
          ? "No pending requests right now - others may want to connect as you explore together!"
          : type === 'sent'
          ? "Connection requests you send will appear here"
          : "No team-up invitations yet"}
      </p>
    </div>
  )
}

export default InvitationsEmptyState
