from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    health,
    protected_demo,
    dashboard,
    machines,
    knowledge,
    media,
    reviews,
    procedures,
    troubleshooting,
    decision_trees,
    simulator,
    audio,
    learning,
    voice,
    jobs,
    assistant,
    simulations,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(protected_demo.router)
api_router.include_router(dashboard.router)
api_router.include_router(machines.router)
api_router.include_router(knowledge.router)
api_router.include_router(media.router)
api_router.include_router(reviews.router)
api_router.include_router(procedures.router)
api_router.include_router(troubleshooting.router)
api_router.include_router(decision_trees.router)
api_router.include_router(simulator.router)
api_router.include_router(audio.router)
api_router.include_router(learning.router)
api_router.include_router(voice.router)
api_router.include_router(jobs.router)
api_router.include_router(assistant.router)
api_router.include_router(simulations.router)
