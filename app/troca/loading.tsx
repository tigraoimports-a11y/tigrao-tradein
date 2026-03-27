export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-[#E8740E] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    </div>
  );
}
