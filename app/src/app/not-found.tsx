// Force dynamic so the Convex provider hooks don't fail at build
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground">Página no encontrada</p>
        <a href="/" className="text-primary hover:underline">Volver al inicio</a>
      </div>
    </div>
  );
}
