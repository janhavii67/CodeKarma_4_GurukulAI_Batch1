from fastapi import APIRouter
from app.api.v1.endpoints import auth, health, knowledge, machines, media, protected_demo

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(machines.router)
api_router.include_router(knowledge.router)
api_router.include_router(media.router)
api_router.include_router(protected_demo.router)

