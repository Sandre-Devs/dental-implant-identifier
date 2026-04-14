export default function Empty({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={40} className="text-gray-600 mb-4"/>}
      <p className="text-gray-300 font-medium mb-1">{title}</p>
      {description && <p className="text-gray-500 text-sm max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}
